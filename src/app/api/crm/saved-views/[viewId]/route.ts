import { env } from "cloudflare:workers";
import { savedViewOutputSchema, savedViewUpdateSchema } from "@/lib/services/saved-views/saved-view-contracts";
import { stableIdSchema } from "@/lib/listing/list-contract";
import { HttpError } from "@/lib/http/http-errors";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
function id(value: string) { const parsed = stableIdSchema.safeParse(value); if (!parsed.success) throw new HttpError(400, "validation_failed", "Invalid ID"); return parsed.data; }
export function createSavedViewPatchHandler(root: CompositionRoot, viewId: string) { return createRouteHandler(root, { input: savedViewUpdateSchema, output: savedViewOutputSchema, unsafe: true, handle: ({ context, input }) => root.views.update(context, id(viewId), input) }); }
export function createSavedViewDeleteHandler(root: CompositionRoot, viewId: string) { return createRouteHandler(root, { unsafe: true, handle: ({ context }) => root.views.delete(context, id(viewId)) }); }
export async function PATCH(request: Request, context: { params: Promise<{ viewId: string }> }) { return createSavedViewPatchHandler(createCompositionRoot(env as RuntimeEnv), (await context.params).viewId)(request); }
export async function DELETE(request: Request, context: { params: Promise<{ viewId: string }> }) { return createSavedViewDeleteHandler(createCompositionRoot(env as RuntimeEnv), (await context.params).viewId)(request); }
