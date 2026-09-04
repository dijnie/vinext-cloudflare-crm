import { createAuth } from "@/auth/auth";
import type { AuthEmailAdapter } from "@/auth/email-adapter";
import { ResendEmailAdapter } from "@/auth/resend-email-adapter";
import { createDatabase } from "@/db/client";

export interface RuntimeEnv extends Cloudflare.Env {
  BETTER_AUTH_SECRET: string;
  AUTH_ALLOWED_EMAILS: string;
  AUTH_BASE_URL: string;
  AUTH_EMAIL_FROM: string;
  RESEND_API_KEY: string;
}

export function createCompositionRoot(
  runtimeBindings: RuntimeEnv,
  emailAdapter: AuthEmailAdapter = new ResendEmailAdapter({
    apiKey: runtimeBindings["RESEND_API_KEY"],
    from: runtimeBindings["AUTH_EMAIL_FROM"],
  }),
) {
  const db = createDatabase(runtimeBindings.DB);
  const auth = createAuth(
    db,
    {
      secret: runtimeBindings["BETTER_AUTH_SECRET"],
      allowedEmails: runtimeBindings["AUTH_ALLOWED_EMAILS"],
      baseUrl: runtimeBindings["AUTH_BASE_URL"],
    },
    emailAdapter,
  );
  return { auth, db, env: runtimeBindings };
}

export type CompositionRoot = ReturnType<typeof createCompositionRoot>;
