import { env } from "cloudflare:workers";
import { z } from "zod";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { reportGoalInputSchema } from "@/lib/services/reports/report-contracts";

const output = z.object({ saved: z.literal(true) });
export function createReportGoalPutHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, ownerOnly: true, input: reportGoalInputSchema, output, handle: ({ context, input }) => root.reports.setGoal(context, input) }); }
export function PUT(request: Request) { return createReportGoalPutHandler(createCompositionRoot(env as RuntimeEnv))(request); }
