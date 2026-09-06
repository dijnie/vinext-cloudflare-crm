import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { fileMetadataSchema } from "@/lib/services/files/file-contracts";
export function createFileGetHandler(root: CompositionRoot, id: string) { return createRouteHandler(root, { output: fileMetadataSchema, handle: ({ context }) => root.files.metadata(context, id) }); }
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) { return createFileGetHandler(createCompositionRoot(env as RuntimeEnv), (await params).fileId)(request); }
