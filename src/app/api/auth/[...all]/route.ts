import { env } from "cloudflare:workers";

import { handleAuthRequest } from "@/modules/auth/auth";
import {
  createCompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";

async function handler(request: Request) {
  const root = createCompositionRoot(env as RuntimeEnv);
  const runtimeBindings = root["env"];
  return handleAuthRequest(
    request,
    root.auth,
    root.db,
    runtimeBindings["AUTH_BASE_URL"],
  );
}

export const GET = handler;
export const POST = handler;
