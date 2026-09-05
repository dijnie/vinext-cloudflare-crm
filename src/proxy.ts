import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { applySecurityHeaders } from "./server/security-headers";
import { LOCALE_COOKIE, localeFromPath } from "./i18n/config";

const QUARANTINED_PREFIXES = [
  "/admin",
  "/api/customers",
  "/api/subscriptions",
  "/api/customer_subscriptions",
];

export function proxy(request: NextRequest) {
  let response: NextResponse;
  if (
    QUARANTINED_PREFIXES.some(
      (prefix) =>
        request.nextUrl.pathname === prefix ||
        request.nextUrl.pathname.startsWith(`${prefix}/`),
    )
  ) {
    response = new NextResponse(null, { status: 404 });
  } else {
    const locale = localeFromPath(request.nextUrl.pathname);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-app-locale", locale ?? request.cookies.get(LOCALE_COOKIE)?.value ?? "vi");
    requestHeaders.set("x-request-path", request.nextUrl.pathname);
    requestHeaders.set("x-request-search", request.nextUrl.search);
    response = NextResponse.next({ request: { headers: requestHeaders } });
    if (locale) response.cookies.set(LOCALE_COOKIE, locale, { httpOnly: false, maxAge: 31_536_000, path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  }
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: ["/:path*"],
};
