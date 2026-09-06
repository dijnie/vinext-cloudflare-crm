import { HttpError } from "@/lib/http/http-errors";
import { permissionError } from "../permissions/permission-policy";
import { relationError } from "../shared/service-utils";
export function catalogWriteError(error: unknown): never {
  let cause = error;
  while (cause && typeof cause === "object") {
    if (cause instanceof Error && /catalog_|operation_conflict|UNIQUE constraint failed/i.test(cause.message)) throw new HttpError(409, "conflict", "Catalog record, references or SKU changed; reload before saving");
    cause = "cause" in cause ? cause.cause : null;
  }
  try { permissionError(error); } catch (classified) { relationError(classified, "Catalog relationship is invalid"); }
}
export function normalizeSku(value: string | null | undefined) {
  const trimmed = value?.replace(/^ +| +$/g, "") ?? "";
  return trimmed ? trimmed.replace(/[A-Z]/g, letter => letter.toLowerCase()) : null;
}
