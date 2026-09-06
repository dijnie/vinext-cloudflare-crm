import { env } from "cloudflare:workers";
import { verifyCurrentPassword } from "@/lib/auth/verify-current-password";
import { fieldDefinitionSchema, fieldDeleteInputSchema, fieldPatchInputSchema } from "@/lib/services/custom-fields/field-contracts";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { HttpError } from "@/lib/http/http-errors";
import { createRouteHandler } from "@/lib/http/route-handler";

function validateId(id: string) { if (!id || id.length > 100) throw new HttpError(400, "validation_failed", "Invalid field ID"); }
export function createFieldGetHandler(root: CompositionRoot, id: string) { return createRouteHandler(root, { handle: async ({ context, request }) => { validateId(id); return new URL(request.url).searchParams.get("coverage") === "true" ? await root.fields.coverage(context, id) : await root.fields.byId(context, id); } }); }
export function createFieldPatchHandler(root: CompositionRoot, id: string) { return createRouteHandler(root, { input: fieldPatchInputSchema, output: fieldDefinitionSchema, unsafe: true, handle: ({ context, input }) => { validateId(id); return input.action === "update" ? root.fields.update(context, id, input.data) : root.fields[input.action](context, id); } }); }
export function createFieldDeleteHandler(root: CompositionRoot, id: string) { return createRouteHandler(root, { input: fieldDeleteInputSchema, unsafe: true, handle: async ({ context, input }) => {
  validateId(id);
  const verified = await verifyCurrentPassword(root.auth, context.userId, input.password);
  if (!verified) throw new HttpError(400, "validation_failed", "Password confirmation failed");
  const result = await root.fields.delete(context, id, input.confirmation);
  root.securityLogger({ code: "custom_field_tombstoned", requestId: context.requestId, method: "DELETE", outcome: "succeeded" });
  return result;
} }); }
type Params = { params: Promise<{ fieldId: string }> };
export async function GET(request: Request, { params }: Params) { return createFieldGetHandler(createCompositionRoot(env as RuntimeEnv), (await params).fieldId)(request); }
export async function PATCH(request: Request, { params }: Params) { return createFieldPatchHandler(createCompositionRoot(env as RuntimeEnv), (await params).fieldId)(request); }
export async function DELETE(request: Request, { params }: Params) { return createFieldDeleteHandler(createCompositionRoot(env as RuntimeEnv), (await params).fieldId)(request); }
