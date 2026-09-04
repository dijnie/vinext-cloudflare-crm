import { env } from "cloudflare:workers";

import { validateApiTokenResponse } from "@/lib/api";
import { SubscriptionService } from "@/lib/services/subscription";

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

  const subscriptionService = new SubscriptionService(DB);

  try {
    const subscription = await subscriptionService.getById(id);

    if (!subscription) {
      return Response.json(
        { message: "Subscription not found" },
        { status: 404 },
      );
    }

    return Response.json({ subscription });
  } catch (error) {
    return Response.json(
      { message: "Couldn't load subscription" },
      { status: 500 },
    );
  }
}
