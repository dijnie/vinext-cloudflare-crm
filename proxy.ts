import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const QUARANTINED_PREFIXES = [
  "/admin",
  "/api/customers",
  "/api/subscriptions",
  "/api/customer_subscriptions",
];

export function proxy(request: NextRequest) {
  if (
    QUARANTINED_PREFIXES.some(
      (prefix) =>
        request.nextUrl.pathname === prefix ||
        request.nextUrl.pathname.startsWith(`${prefix}/`),
    )
  ) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/customers/:path*",
    "/api/subscriptions/:path*",
    "/api/customer_subscriptions/:path*",
  ],
};
