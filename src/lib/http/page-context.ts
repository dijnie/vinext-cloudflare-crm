import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { cache } from "react";

import { createCompositionRoot, type RuntimeEnv } from "../composition-root";
import { requireRequestContext } from "./request-context";

// React scopes this memoization to one server render, never across requests.
// API handlers keep their independent authorization checks.
export const getPageContext = cache(async () => {
  const requestHeaders = new Headers(await headers());
  const root = createCompositionRoot(env as RuntimeEnv);
  const context = await requireRequestContext(requestHeaders, root);
  return { root, context, requestHeaders };
});
