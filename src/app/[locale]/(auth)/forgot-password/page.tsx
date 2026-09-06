import { AuthPanel } from "@/components/app/auth/auth-panel";
import { SINGLETON_WORKSPACE_SLUG } from "@/lib/services/members/singleton-workspace";
import { isAppLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; if (!isAppLocale(locale)) notFound(); return <AuthPanel dictionary={getDictionary(locale)} locale={locale} mode="forgot-password" workspaceSlug={SINGLETON_WORKSPACE_SLUG} />; }
