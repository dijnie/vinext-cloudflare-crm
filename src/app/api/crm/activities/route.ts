import { env } from "cloudflare:workers";
import { activityCreateInputSchema, activityEntryOutputSchema, timelineInputSchema, timelineOutputSchema } from "@/crm/contracts/activity-contract";
import { parseSearchParams } from "@/crm/contracts/list-contract";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { createRouteHandler } from "@/server/route-handler";

export function createActivitiesGetHandler(root: CompositionRoot) {
  return createRouteHandler(root, { output: timelineOutputSchema, handle: ({ context, request }) => root.activities.timeline(context, parseSearchParams(request, timelineInputSchema)) });
}
export function createActivitiesPostHandler(root: CompositionRoot) {
  return createRouteHandler(root, { input: activityCreateInputSchema, output: activityEntryOutputSchema, unsafe: true, handle: ({ context, input }) => root.activities.create(context, input) });
}
export function GET(request: Request) { return createActivitiesGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
export function POST(request: Request) { return createActivitiesPostHandler(createCompositionRoot(env as RuntimeEnv))(request); }
