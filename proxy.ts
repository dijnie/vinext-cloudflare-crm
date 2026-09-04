import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { applySecurityHeaders } from "./src/server/security-headers";

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
    response = NextResponse.next();
  }
  applySecurityHeaders(response.headers);
  return response;
}

export const config = {
  matcher: ["/:path*"],
};
