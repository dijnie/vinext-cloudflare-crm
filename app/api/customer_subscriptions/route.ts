import { env } from "cloudflare:workers";

import { validateApiTokenResponse } from "@/lib/api";
import { CustomerSubscriptionService } from "@/lib/services/customer_subscription";

const runtimeEnv = env as Cloudflare.Env & { API_TOKEN?: string };

export async function GET(request: Request) {
  const { API_TOKEN, DB } = runtimeEnv;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const customerSubscriptionService = new CustomerSubscriptionService(DB);
  const customerSubscriptions = await customerSubscriptionService.getAll();

  if (customerSubscriptions.length) {
    return Response.json({
      customer_subscriptions: customerSubscriptions,
    });
  } else {
    return Response.json(
      { message: "Couldn't load customer subscriptions" },
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

  const body = (await request.json()) as Parameters<
    CustomerSubscriptionService["create"]
  >[0];
  const customerSubscriptionService = new CustomerSubscriptionService(DB);

  const response = await customerSubscriptionService.create(body);

  if (response.success) {
    return Response.json(
      { message: "Customer subscription created successfully", success: true },
      { status: 201 },
    );
  } else {
    return Response.json(
      { message: "Couldn't create customer subscription", success: false },
      { status: 500 },
    );
  }
}
