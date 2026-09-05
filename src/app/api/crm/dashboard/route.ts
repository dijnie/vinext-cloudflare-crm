import { env } from "cloudflare:workers";
import { dashboardInputSchema, dashboardSummarySchema } from "@/modules/dashboard/dashboard-contracts";
import { parseSearchParams } from "@/modules/crm/contracts/list-contract";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { createRouteHandler } from "@/server/route-handler";
export function createDashboardGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: dashboardSummarySchema, handle: ({ context, request }) => root.dashboard.summary(context, parseSearchParams(request, dashboardInputSchema)) }); }
export function GET(request: Request) { return createDashboardGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
