import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { parseSearchParams } from "@/lib/listing/list-contract";
import { fileMetadataSchema, fileUploadInputSchema } from "@/lib/services/files/file-contracts";
export function createFilesPostHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, rawBody: true, output: fileMetadataSchema, handle: ({ context, request }) => root.files.upload(context, parseSearchParams(request, fileUploadInputSchema), request) }); }
export function POST(request: Request) { return createFilesPostHandler(createCompositionRoot(env as RuntimeEnv))(request); }
