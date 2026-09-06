import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
export function createFileDownloadHandler(root: CompositionRoot, id: string) { return createRouteHandler(root, { rawResponse: true, handle: ({ context }) => root.files.download(context, id) }); }
export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) { return createFileDownloadHandler(createCompositionRoot(env as RuntimeEnv), (await params).fileId)(request); }
