import { env } from "cloudflare:workers";
import { z } from "zod";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
export function createFilesCleanupHandler(root: CompositionRoot) { return createRouteHandler(root, { unsafe: true, ownerOnly: true, input: z.object({}).strict(), handle: ({ context }) => root.files.cleanup(context) }); }
export function POST(request: Request) { return createFilesCleanupHandler(createCompositionRoot(env as RuntimeEnv))(request); }
