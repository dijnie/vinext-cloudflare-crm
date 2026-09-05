import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SINGLETON_WORKSPACE_SLUG } from "@/modules/auth/singleton-workspace";
import { canonicalWorkspacePath, LOCALE_COOKIE, savedLocale } from "@/i18n/config";

export default async function HomePage() {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  redirect(canonicalWorkspacePath(savedLocale(saved), SINGLETON_WORKSPACE_SLUG));
}
