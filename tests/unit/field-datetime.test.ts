import { describe, expect, it } from "vitest";
import { localDateTime, resolveLocalDateTime } from "@/lib/services/custom-fields/field-datetime";
import { fieldConfigSchema, fieldValuesInputSchema } from "@/lib/services/custom-fields/field-contracts";
import { isValidFieldCriterion } from "@/lib/services/custom-fields/field-filter-contracts";
describe("business timezone datetime resolution",()=>{
 it("round trips UTC and Vietnam with exact milliseconds across year boundaries",()=>{
  expect(localDateTime("2025-12-31T20:15:16.789Z","Asia/Ho_Chi_Minh")).toBe("2026-01-01T03:15:16.789");
  expect(resolveLocalDateTime("2026-01-01T03:15:16.789","Asia/Ho_Chi_Minh")).toEqual([{instant:"2025-12-31T20:15:16.789Z",offset:"+07:00"}]);
  expect(resolveLocalDateTime("2026-01-01T00:00","UTC")).toEqual([{instant:"2026-01-01T00:00:00.000Z",offset:"+00:00"}]);
 });
 it("returns no candidate for New York gaps and both explicit offsets for repeated hours",()=>{
  expect(resolveLocalDateTime("2026-03-08T02:30","America/New_York")).toEqual([]);
  expect(resolveLocalDateTime("2026-11-01T01:30:00.123","America/New_York")).toEqual([{instant:"2026-11-01T05:30:00.123Z",offset:"-04:00"},{instant:"2026-11-01T06:30:00.123Z",offset:"-05:00"}]);
 });
 it("handles Lord Howe half hour clock changes",()=>{
  expect(resolveLocalDateTime("2026-10-04T02:15","Australia/Lord_Howe")).toEqual([]);
  expect(resolveLocalDateTime("2026-04-05T01:45","Australia/Lord_Howe")).toEqual([{instant:"2026-04-04T14:45:00.000Z",offset:"+11:00"},{instant:"2026-04-04T15:15:00.000Z",offset:"+10:30"}]);
 });
 it("rejects invalid local precision leap days and zones without normalizing",()=>{
  expect(resolveLocalDateTime("2024-02-29T12:00:00.1","UTC")[0].instant).toBe("2024-02-29T12:00:00.100Z");
  for(const value of ["2026-02-29T12:00","2026-01-01T24:01","2026-01-01","2026-01-01T00:00Z","2026-01-01T00:00:00.1234","2026-01-01T00:00:00+07:00"]) expect(()=>resolveLocalDateTime(value,"UTC"),value).toThrow();
  expect(()=>resolveLocalDateTime("2026-01-01T00:00","Invalid/Zone")).toThrow();
 });
 it("bounds datetime metadata and accepts only UTC millisecond condition instants",()=>{
  expect(fieldConfigSchema.parse({dateTime:false})).toEqual({dateTime:false});expect(fieldConfigSchema.safeParse({dateTime:"true"}).success).toBe(false);
  expect(fieldValuesInputSchema.safeParse({entity:"company",recordId:"id",values:{},calendarRevision:-1}).success).toBe(false);
  for(const value of ["2026-01-01","2026-01-01T12:34:56.789Z"]) expect(isValidFieldCriterion("date",{key:"d",operator:"eq",value})).toBe(true);
  for(const value of ["2026-01-01T12:34:56.1234Z","2026-01-01T12:34:56+07:00","2026-02-30"]) expect(isValidFieldCriterion("date",{key:"d",operator:"eq",value})).toBe(false);
 });
});
