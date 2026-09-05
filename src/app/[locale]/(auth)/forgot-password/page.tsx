import { AuthPanel } from "@/components/auth/auth-panel";
import { SINGLETON_WORKSPACE_SLUG } from "@/auth/singleton-workspace";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isAppLocale(locale)) notFound(); return <AuthPanel dictionary={getDictionary(locale)} locale={locale} mode="forgot-password" workspaceSlug={SINGLETON_WORKSPACE_SLUG} />; }
