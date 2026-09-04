import { env } from "cloudflare:workers";

import { validateApiTokenResponse } from "@/lib/api";
import { CustomerService } from "@/lib/services/customer";

const runtimeEnv = env as Cloudflare.Env & { API_TOKEN?: string };

export async function GET(request: Request) {
  const { API_TOKEN, DB } = runtimeEnv;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const customerService = new CustomerService(DB);
  const customers = await customerService.getAll();

  if (customers) {
    return Response.json({ customers });
  } else {
    return Response.json(
      { message: "Couldn't load customers" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { API_TOKEN, DB } = runtimeEnv;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const customerService = new CustomerService(DB);

  const body = (await request.json()) as Parameters<
    CustomerService["create"]
  >[0];
  const success = await customerService.create(body);

  if (success) {
    return Response.json(
      { message: "Customer created successfully", success: true },
      { status: 201 },
    );
  } else {
    return Response.json(
      { message: "Couldn't create customer", success: false },
      { status: 500 },
    );
  }
}
