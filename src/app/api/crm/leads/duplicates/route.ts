import { z } from "zod";
import { env } from "cloudflare:workers";
import { createCompositionRoot, type CompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { createRouteHandler } from "@/lib/http/route-handler";
import { parseSearchParams } from "@/lib/listing/list-contract";
const inputSchema = z.object({ email: z.string().trim().max(320).optional(), phone: z.string().trim().max(80).optional(), excludeLeadId: z.uuid().optional() }).strict();
const candidate = z.object({ id: z.uuid(), firstName: z.string(), lastName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), reasons: z.array(z.enum(["email", "phone"])) });
const outputSchema = z.object({ leads: z.array(candidate), contacts: z.array(candidate) });
export function createGetHandler(root: CompositionRoot) { return createRouteHandler(root, { output: outputSchema, handle: ({ context, request }) => root.leads.duplicates(context, parseSearchParams(request, inputSchema)) }); }
export function GET(request: Request) { return createGetHandler(createCompositionRoot(env as RuntimeEnv))(request); }
