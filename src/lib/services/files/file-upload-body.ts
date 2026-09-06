import { HttpError } from "@/lib/http/http-errors";
import { MAX_FILE_BYTES } from "./file-contracts";
export function uploadFileName(request: Request): string {
  let name: string;
  try { name = decodeURIComponent(request.headers.get("x-file-name") ?? ""); }
  catch { throw new HttpError(400, "validation_failed", "Invalid file name"); }
  if (!name.trim() || name.length > 255 || /[\u0000-\u001f\u007f-\u009f/\\]/u.test(name) || name === "." || name === "..") throw new HttpError(400, "validation_failed", "Invalid file name");
  return name;
}
export async function readUploadBody(request: Request): Promise<Uint8Array> {
  if (request.headers.get("content-type") !== "application/octet-stream") throw new HttpError(415, "invalid_content_type", "Use application/octet-stream");
  if (!request.body) throw new HttpError(400, "validation_failed", "File body is required");
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new HttpError(408, "input_limit_exceeded", "Upload timed out")); void reader.cancel().catch(() => {}); }, 60_000); });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_FILE_BYTES) { void reader.cancel().catch(() => {}); throw new HttpError(413, "input_limit_exceeded", "File is too large"); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
