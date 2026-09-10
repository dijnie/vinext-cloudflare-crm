import { env } from "cloudflare:workers";
import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/lib/composition-root";
import { HttpError } from "@/lib/http/http-errors";
import { handleIntegrationRequest } from "@/lib/http/integration-api-handler";
import { appLeadCreateSchema } from "@/lib/services/integrations/integration-contract";
import { parseJsonInput } from "@/lib/http/validation";
export const createIntegrationLeadsGetHandler =
  (root: CompositionRoot) => async (request: Request) =>
    handleIntegrationRequest(root, request, (token) => {
      const rawLimit = new URL(request.url).searchParams.get("limit") ?? "100";
      if (
        !/^\d{1,3}$/.test(rawLimit) ||
        Number(rawLimit) < 1 ||
        Number(rawLimit) > 100
      )
        throw new HttpError(
          400,
          "validation_failed",
          "Limit must be an integer from 1 to 100",
        );
      return root.integrations
        .appLeads(token, Number(rawLimit))
        .then((rows) => ({ rows }));
    });
export const createIntegrationLeadsPostHandler =
  (root: CompositionRoot) => async (request: Request) =>
    handleIntegrationRequest(root, request, async (token) =>
      root.integrations.appCreateLead(
        token,
        await parseJsonInput(request, appLeadCreateSchema),
      ),
    );
export function GET(request: Request) {
  return createIntegrationLeadsGetHandler(
    createCompositionRoot(env as RuntimeEnv),
  )(request);
}
export function POST(request: Request) {
  return createIntegrationLeadsPostHandler(
    createCompositionRoot(env as RuntimeEnv),
  )(request);
}
