import { HttpError } from "@/lib/http/http-errors";
import { permissionError } from "../permissions/permission-policy";

export function storageWriteError(error: unknown): never {
  let current = error;
  while (current && typeof current === "object") {
    if (current instanceof Error && current.message.includes("workspace_deletion_in_progress")) {
      throw new HttpError(409, "conflict", "File uploads are frozen while workspace deletion is running");
    }
    current = "cause" in current ? current.cause : null;
  }
  permissionError(error);
}
