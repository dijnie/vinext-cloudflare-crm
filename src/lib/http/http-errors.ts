export type HttpErrorCode =
  | "authentication_required"
  | "membership_required"
  | "owner_required"
  | "permission_required"
  | "invalid_origin"
  | "invalid_content_type"
  | "invalid_json"
  | "input_limit_exceeded"
  | "payload_too_large"
  | "invalid_signature"
  | "rate_limited"
  | "validation_failed"
  | "not_found"
  | "conflict"
  | "internal_error";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: HttpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
