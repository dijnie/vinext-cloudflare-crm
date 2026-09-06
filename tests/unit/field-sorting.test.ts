import { describe, expect, it } from "vitest";
import { FIELD_TYPES } from "@/lib/services/custom-fields/field-contracts";
import { customFieldSortSchema, isSortableFieldType } from "@/lib/services/custom-fields/field-sort-contracts";
import { companyListInputSchema } from "@/lib/services/companies/company-contract";
import { contactListInputSchema } from "@/lib/services/contacts/contact-contract";
import { dealListInputSchema } from "@/lib/services/deals/deal-contract";

describe("scalar sort query contracts",()=>{
 it("supports exactly thirteen scalar families",()=>{
  expect(FIELD_TYPES.filter(isSortableFieldType)).toEqual(["text","long_text","number","date","checkbox","select","url","email","phone","user","rating","customer","formula"]);
 });
 it("accepts bounded stable keys and rejects malformed or injected sort expressions",()=>{
  for(const key of ["field:a","field:stable_key_2","field:"+"a".repeat(60)]) expect(customFieldSortSchema.safeParse(key).success).toBe(true);
  for(const key of ["field:","field:Upper","field:a-b","field:a;drop table company","field:"+"a".repeat(61),"field:a desc","field:a.b"]) expect(customFieldSortSchema.safeParse(key).success).toBe(false);
 });
 it("preserves custom sort direction across three entity contracts and existing built in sorts",()=>{
  for(const schema of [companyListInputSchema,contactListInputSchema,dealListInputSchema]) for(const dir of ["asc","desc"]) expect(schema.parse({sort:"field:score",dir})).toMatchObject({sort:"field:score",dir});
  expect(companyListInputSchema.parse({sort:"name"}).sort).toBe("name"); expect(dealListInputSchema.parse({sort:"amount"}).sort).toBe("amount");
 });
});
