import type { ZodType } from "zod";

import type { CompositionRoot } from "./composition-root";
import { HttpError, isHttpError } from "./http-errors";
import { requireRequestContext, type RequestContext } from "./request-context";
import { applySecurityHeaders } from "./security-headers";
import { assertSafeMutationRequest, parseJsonInput } from "./validation";

export interface RouteHandlerOptions<TInput, TResult> {
  input?: ZodType<TInput>;
  output?: ZodType;
  unsafe?: boolean;
  ownerOnly?: boolean;
  handle: (args: {
    context: RequestContext;
    input: TInput;
    request: Request;
    root: CompositionRoot;
  }) => Promise<TResult>;
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  applySecurityHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createRouteHandler<TInput = undefined, TResult = unknown>(
  root: CompositionRoot,
  options: RouteHandlerOptions<TInput, TResult>,
) {
  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    try {
      const context = await requireRequestContext(request.headers, root);
      if (options.ownerOnly && context.role !== "owner") {
        throw new HttpError(403, "owner_required", "Owner role is required");
      }
      if (options.unsafe) {
        const baseUrl = root["env"]["AUTH_BASE_URL"];
        await assertSafeMutationRequest(request, new URL(baseUrl).origin);
      }
      const input = options.input
        ? await parseJsonInput(request, options.input)
        : (undefined as TInput);
      const handled = await options.handle({ context, input, request, root });
      const result = options.output ? options.output.parse(handled) : handled;
      return withSecurityHeaders(Response.json(result));
    } catch (error) {
      const status = isHttpError(error) ? error.status : 500;
      const code = isHttpError(error) ? error.code : "internal_error";
      root.securityLogger({
        code,
        requestId,
        method: request.method,
        outcome: status < 500 ? "rejected" : "failed",
      });
      return withSecurityHeaders(
        Response.json({ error: { code, requestId } }, { status }),
      );
    }
  };
}
