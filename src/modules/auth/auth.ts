import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";

import type { AppDatabase } from "@/db/client";
import * as schema from "@/db/schema";

import type { AuthEmailAdapter } from "./email-adapter";
import { normalizeEmail } from "./normalize-email";
import {
  findUserByNormalizedEmail,
  reconcileSingletonMembership,
} from "./singleton-workspace";

export interface AuthConfiguration {
  secret: string;
  baseUrl: string;
}

const GENERIC_AUTH_ERROR = "Unable to continue";

function parseCanonicalOrigin(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Auth base URL must be a canonical HTTPS origin");
  }
  return url;
}

function assertCanonicalEmailUrl(value: string, baseUrl: URL): string {
  const url = new URL(value);
  if (url.origin !== baseUrl.origin) {
    throw new Error("Auth email URL has an untrusted origin");
  }
  return url.toString();
}

export function createAuth(
  db: AppDatabase,
  config: AuthConfiguration,
  emailAdapter: AuthEmailAdapter,
) {
  if (config.secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  }
  const baseUrl = parseCanonicalOrigin(config.baseUrl);
  return betterAuth({
    appName: "CRM",
    baseURL: baseUrl.origin,
    secret: config.secret,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
      usePlural: false,
    }),
    session: {
      expiresIn: 60 * 60,
      // Renew after five minutes, while still validating against DB on every request.
      updateAge: 5 * 60,
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 15 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await emailAdapter.sendPasswordReset({
          to: user.email,
          url: assertCanonicalEmailUrl(url, baseUrl),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await emailAdapter.sendVerification({
          to: user.email,
          url: assertCanonicalEmailUrl(url, baseUrl),
        });
      },
      afterEmailVerification: async (verifiedUser) => {
        await reconcileSingletonMembership(db, verifiedUser.id);
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (sessionData) => {
            const currentUser = await db.query.user.findFirst({
              where: (table, { eq }) => eq(table.id, sessionData.userId),
            });
            if (!currentUser?.emailVerified) {
              throw new APIError("FORBIDDEN", { message: GENERIC_AUTH_ERROR });
            }
            await reconcileSingletonMembership(db, currentUser.id);
            return { data: sessionData };
          },
        },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    advanced: {
      database: { joins: true },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: true,
    },
  });
}

export async function handleAuthRequest(
  request: Request,
  auth: ReturnType<typeof createAuth>,
  db: AppDatabase,
  authBaseUrl: string,
): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const canonicalUrl = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    parseCanonicalOrigin(authBaseUrl),
  );
  const path = incomingUrl.pathname.replace(/^\/api\/auth/, "");
  const canonicalHeaders = new Headers(request.headers);
  if (
    canonicalHeaders.get("origin") === incomingUrl.origin &&
    incomingUrl.host === canonicalUrl.host
  ) {
    canonicalHeaders.set("origin", canonicalUrl.origin);
  }
  if (
    request.method !== "POST" ||
    !["/sign-up/email", "/sign-in/email"].includes(path)
  ) {
    return auth.handler(
      new Request(canonicalUrl, {
        method: request.method,
        headers: canonicalHeaders,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : request.body,
        signal: request.signal,
      }),
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.clone().json()) as Record<string, unknown>;
  } catch {
    return Response.json({ message: GENERIC_AUTH_ERROR }, { status: 400 });
  }
  if (typeof body.email !== "string") {
    return Response.json({ message: GENERIC_AUTH_ERROR }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(body.email);
  if (path === "/sign-in/email") {
    const currentUser = await findUserByNormalizedEmail(db, normalizedEmail);
    if (currentUser?.emailVerified) {
      try {
        await reconcileSingletonMembership(db, currentUser.id);
      } catch {
        return Response.json({ message: GENERIC_AUTH_ERROR }, { status: 400 });
      }
    }
  }

  canonicalHeaders.set("content-type", "application/json");
  return auth.handler(
    new Request(canonicalUrl, {
      method: request.method,
      headers: canonicalHeaders,
      body: JSON.stringify({ ...body, email: normalizedEmail }),
      signal: request.signal,
    }),
  );
}
