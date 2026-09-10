import type { Metadata } from "next";
import { SwaggerDocs } from "@/components/api-docs/swagger-docs";

export const metadata: Metadata = { title: "CRM Integration API" };

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-white">
      <SwaggerDocs />
    </main>
  );
}
