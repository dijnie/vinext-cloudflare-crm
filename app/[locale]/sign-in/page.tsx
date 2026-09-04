import { notFound } from "next/navigation";

import { getDictionary, isAppLocale } from "@/i18n/get-dictionary";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const dictionary = getDictionary(locale);
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold">{dictionary.signInTitle}</h1>
      <p className="mt-4 text-muted-foreground">
        {dictionary.signInDescription}
      </p>
    </main>
  );
}
