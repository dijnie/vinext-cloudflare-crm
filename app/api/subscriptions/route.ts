import { env } from "cloudflare:workers";

import { validateApiTokenResponse } from "@/lib/api";
import { SubscriptionService } from "@/lib/services/subscription";

const runtimeEnv = env as Cloudflare.Env & { API_TOKEN?: string };

export async function GET(request: Request) {
  const { API_TOKEN, DB } = runtimeEnv;

  const invalidTokenResponse = await validateApiTokenResponse(
    request,
    API_TOKEN,
  );
  if (invalidTokenResponse) return invalidTokenResponse;

  const subscriptionService = new SubscriptionService(DB);

  try {
    const subscriptions = await subscriptionService.getAll();
    return Response.json({ subscriptions });
  } catch (error) {
    return Response.json(
      { message: "Couldn't load subscriptions" },
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

  const subscriptionService = new SubscriptionService(DB);

  try {
    const body = (await request.json()) as Parameters<
      SubscriptionService["create"]
    >[0];
    await subscriptionService.create(body);
    return Response.json(
      {
        message: "Subscription created successfully",
        success: true,
      },
      { status: 201 },
    );
  } catch (error: any) {
    return Response.json(
      {
        message: error.message || "Failed to create subscription",
        success: false,
      },
      { status: 500 },
    );
  }
}
