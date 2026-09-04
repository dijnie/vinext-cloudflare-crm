import { env } from "cloudflare:workers";
import type { ReactNode } from "react";

import { Header } from "@/components/Header";
import ApiTokenMissingCard from "@/components/admin/api-token-missing-card";

export function AdminPage({
  actions,
  children,
  currentPath,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  currentPath: string;
  title: string;
}) {
  const apiTokenSet = env.API_TOKEN && env.API_TOKEN !== "";

  return (
    <>
      <Header currentPath={currentPath} />
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="mb-4">{!apiTokenSet && <ApiTokenMissingCard />}</div>
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
          {actions}
        </div>
        {children}
      </div>
    </>
  );
}
