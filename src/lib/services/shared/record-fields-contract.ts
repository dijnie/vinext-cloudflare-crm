import { z } from "zod";
import type { AppDatabase } from "@/lib/db/database";
import { fieldValuesSchema } from "../custom-fields/field-contracts";
import type { FieldService } from "../custom-fields/field-service";

export const recordFieldsShape = {
  customFields: fieldValuesSchema.refine(values => Object.keys(values).length <= 100).optional(),
  calendarRevision: z.number().int().nonnegative().optional(),
};

export type RecordWriteStatement = Parameters<AppDatabase["batch"]>[0][number];
export type PreparedRecordFields = Awaited<ReturnType<FieldService["prepareValues"]>>;

// Created only by the reservation service after validating the caller's draft.
export interface PreparedRecordCreation {
  recordId: string;
  before: RecordWriteStatement[];
  after: RecordWriteStatement[];
}
