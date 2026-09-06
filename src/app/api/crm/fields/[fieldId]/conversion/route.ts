import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { HttpError } from "@/lib/http/http-errors";
import { conversionInputSchema } from "@/lib/services/custom-fields/field-conversion-contracts";

export function createFieldConversionHandler(root: CompositionRoot, id: string) {
  return createRouteHandler(root, { input: conversionInputSchema, unsafe: true, handle: async ({ context, input }) => {
    if (!id || id.length > 100) throw new HttpError(400, "validation_failed", "Invalid field ID");
    return input.action === "preview" ? root.fields.previewConversion(context, id, input.type, input.config) : root.fields.applyConversion(context, id, input.token);
  } });
}
export async function POST(request: Request, { params }: { params: Promise<{ fieldId: string }> }) {
  return createFieldConversionHandler(createCompositionRoot(env as RuntimeEnv), (await params).fieldId)(request);
}
