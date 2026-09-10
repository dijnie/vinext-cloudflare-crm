import { env } from "cloudflare:workers";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { HttpError } from "@/lib/http/http-errors";
import { handleIntegrationRequest } from "@/lib/http/integration-api-handler";
export const createIntegrationContactsGetHandler =
  (root: CompositionRoot) => async (request: Request) =>
    handleIntegrationRequest(root, request, async (token) => {
      const rawLimit = new URL(request.url).searchParams.get("limit") ?? "100";
      if (!/^\d{1,3}$/.test(rawLimit))
        throw new HttpError(
          400,
          "validation_failed",
          "Limit must be an integer from 1 to 100",
        );
      const limit = Number(rawLimit);
      if (limit < 1 || limit > 100)
        throw new HttpError(
          400,
          "validation_failed",
          "Limit must be an integer from 1 to 100",
        );
      return { rows: await root.integrations.appContacts(token, limit) };
    });
export function GET(request: Request) {
  return createIntegrationContactsGetHandler(
    createCompositionRoot(env as RuntimeEnv),
  )(request);
}
