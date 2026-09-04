import { env } from "cloudflare:workers";

import { validateApiTokenResponse } from "@/lib/api";

const runtimeEnv = env as Cloudflare.Env & { API_TOKEN?: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { API_TOKEN, CUSTOMER_WORKFLOW } = runtimeEnv;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const { id } = await params;
  await CUSTOMER_WORKFLOW.create({ params: { id } });
  return new Response(null, { status: 202 });
}
