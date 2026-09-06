import { env } from "cloudflare:workers";
import { dashboardInputSchema, dashboardSummarySchema } from "@/lib/services/dashboard/dashboard-contracts";
import { parseSearchParams } from "@/lib/listing/list-contract";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
export function createDashboardGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: dashboardSummarySchema, handle: ({ context, request }) => root.dashboard.summary(context, parseSearchParams(request, dashboardInputSchema)) }); }
export function GET(request: Request) { return createDashboardGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
