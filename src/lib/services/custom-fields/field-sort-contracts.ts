import { z } from "zod";
import type { FieldType } from "./field-contracts";

export const customFieldSortSchema = z.string().regex(/^field:[a-z][a-z0-9_]{0,59}$/);
const sortableTypes: readonly FieldType[] = ["text", "long_text", "number", "date", "checkbox", "select", "url", "email", "phone", "user", "rating", "customer", "formula"];
export function isSortableFieldType(type: FieldType) { return sortableTypes.includes(type); }
