import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { parseSearchParams } from "@/lib/listing/list-contract";
import { reportInputSchema } from "@/lib/services/reports/report-contracts";

export function createReportExportHandler(root: CompositionRoot) { return createRouteHandler(root, { rawResponse: true, handle: ({ context, request }) => root.reportExports.excel(context, parseSearchParams(request, reportInputSchema)) }); }
export function GET(request: Request) { return createReportExportHandler(createCompositionRoot(env as RuntimeEnv))(request); }
