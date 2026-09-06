import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { parseSearchParams } from "@/lib/listing/list-contract";
import { reportInputSchema, reportOutputSchema } from "@/lib/services/reports/report-contracts";

export function createReportsGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: reportOutputSchema, handle: ({ context, request }) => root.reports.summary(context, parseSearchParams(request, reportInputSchema)) }); }
export function GET(request: Request) { return createReportsGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
