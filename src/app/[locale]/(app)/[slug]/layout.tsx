import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SINGLETON_WORKSPACE_ID } from "@/auth/singleton-workspace";
import { AppShell } from "@/components/crm/app-shell";
import { singletonWorkspace } from "@/db/schema";
import { canonicalWorkspacePath, isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { createCompositionRoot, type RuntimeEnv } from "@/server/composition-root";
import { isHttpError } from "@/server/http-errors";
import { requireRequestContext } from "@/server/request-context";

export default async function ProtectedLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!isAppLocale(locale)) notFound();
  const requestHeaders = new Headers(await headers());
  const root = createCompositionRoot(env as RuntimeEnv);
  let viewer;
  try {
    viewer = await requireRequestContext(requestHeaders, root);
  } catch (error) {
    if (isHttpError(error) && error.status === 401) redirect(`/${locale}/sign-in`);
    if (isHttpError(error) && error.status === 403) notFound();
    throw error;
  }
  const workspace = await root.db.query.singletonWorkspace.findFirst({ where: eq(singletonWorkspace.id, SINGLETON_WORKSPACE_ID) });
  if (!workspace) throw new Error("Singleton workspace is not initialized");
  if (slug !== workspace.slug) {
    const path = requestHeaders.get("x-request-path") ?? `/${locale}/${slug}/companies`;
    const suffix = `/${path.split("/").slice(3).join("/") || "companies"}`;
    redirect(canonicalWorkspacePath(locale, workspace.slug, requestHeaders.get("x-request-search") ?? "", suffix));
  }
  return <AppShell dictionary={getDictionary(locale)} locale={locale} role={viewer.role} slug={workspace.slug}>{children}</AppShell>;
}
