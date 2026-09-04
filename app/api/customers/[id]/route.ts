import { env } from "cloudflare:workers";

import { validateApiTokenResponse } from "@/lib/api";
import { CustomerService } from "@/lib/services/customer";

const runtimeEnv = env as Cloudflare.Env & { API_TOKEN?: string };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { API_TOKEN, DB } = runtimeEnv;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const customerService = new CustomerService(DB);
  const customer = await customerService.getById(id);

  if (!customer) {
    return Response.json({ message: "Customer not found" }, { status: 404 });
  }

  return Response.json({ customer: customer });
}
