import { publicApiDocument } from "@/lib/openapi/public-api-document";
import { applySecurityHeaders } from "@/lib/http/security-headers";

export function GET() {
  const headers = new Headers({
    "cache-control": "public, max-age=300",
    "content-type": "application/json",
  });
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(publicApiDocument), { headers });
}
