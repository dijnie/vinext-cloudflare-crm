import { env } from "cloudflare:workers";
import { activityCompleteInputSchema, activityEntryOutputSchema } from "@/lib/services/activities/activity-contract";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { HttpError } from "@/lib/http/http-errors";
import { createRouteHandler } from "@/lib/http/route-handler";

export function createActivityPatchHandler(root: CompositionRoot, id: string) {
  return createRouteHandler(root, {
    input: activityCompleteInputSchema, output: activityEntryOutputSchema, unsafe: true,
    handle: ({ context, input }) => {
      if (!stableIdSchema.safeParse(id).success) throw new HttpError(400, "validation_failed", "Activity ID is invalid");
      return root.activities.complete(context, id, input.completed);
    },
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ activityId: string }> }) {
  return createActivityPatchHandler(createCompositionRoot(env as RuntimeEnv), (await params).activityId)(request);
}
