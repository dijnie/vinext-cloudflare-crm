"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/modules/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/dictionary";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "verify-email";

interface AuthPanelProps {
  dictionary: AppDictionary;
  locale: AppLocale;
  mode: AuthMode;
  workspaceSlug: string;
}

export function AuthPanel({ dictionary, locale, mode, workspaceSlug }: AuthPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const auth = dictionary.auth;
  const emailFromUrl = searchParams.get("email") ?? "";
  const token = searchParams.get("token");

  const title = mode === "sign-in" ? auth.signInTitle : mode === "sign-up" ? auth.signUpTitle : mode === "forgot-password" ? auth.forgotTitle : mode === "reset-password" ? auth.resetTitle : auth.verifyTitle;
  const description = mode === "sign-in" ? auth.signInDescription : mode === "sign-up" ? auth.signUpDescription : mode === "forgot-password" ? auth.forgotDescription : mode === "reset-password" ? auth.resetDescription : auth.verifyDescription;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setFailed(false);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "");
    let error: unknown;

    if (mode === "sign-in") {
      ({ error } = await authClient.signIn.email({ email, password }));
      if (!error) router.push(`/${locale}/${workspaceSlug}/companies`);
    } else if (mode === "sign-up") {
      ({ error } = await authClient.signUp.email({ name, email, password, callbackURL: `/${locale}/sign-in` }));
      if (!error) router.push(`/${locale}/verify-email?email=${encodeURIComponent(email)}`);
    } else if (mode === "forgot-password") {
      ({ error } = await authClient.requestPasswordReset({ email, redirectTo: `/${locale}/reset-password` }));
      setMessage(auth.resetSent);
    } else if (mode === "reset-password") {
      if (!token) error = new Error("invalid-token");
      else ({ error } = await authClient.resetPassword({ newPassword: password, token }));
      if (!error) setMessage(auth.resetSuccess);
    } else {
      ({ error } = await authClient.sendVerificationEmail({ email, callbackURL: `/${locale}/sign-in` }));
      if (!error) setMessage(auth.verificationSent);
    }

    if (error && mode !== "forgot-password") {
      setFailed(true);
      setMessage(mode === "reset-password" && !token ? auth.invalidResetLink : auth.genericError);
    }
    setPending(false);
  }

  const showName = mode === "sign-up";
  const showEmail = mode !== "reset-password";
  const showPassword = mode === "sign-in" || mode === "sign-up" || mode === "reset-password";
  const submitLabel = mode === "sign-in" ? auth.signIn : mode === "sign-up" ? auth.signUp : mode === "forgot-password" ? auth.sendResetLink : mode === "reset-password" ? auth.resetPassword : auth.resendVerification;

  return (
    <Card className="w-full max-w-md border-border/80 shadow-xl shadow-emerald-950/5">
      <CardHeader>
        <CardTitle><h1 className="text-2xl">{title}</h1></CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <form onSubmit={submit}>
        <CardContent className="space-y-4">
          {showName ? <div className="space-y-2"><Label htmlFor="name">{dictionary.common.name}</Label><Input autoComplete="name" id="name" name="name" required /></div> : null}
          {showEmail ? <div className="space-y-2"><Label htmlFor="email">{dictionary.common.email}</Label><Input autoComplete="email" defaultValue={emailFromUrl} id="email" name="email" required type="email" /></div> : null}
          {showPassword ? <div className="space-y-2"><Label htmlFor="password">{mode === "reset-password" ? auth.newPassword : dictionary.common.password}</Label><Input autoComplete={mode === "sign-in" ? "current-password" : "new-password"} id="password" minLength={8} name="password" required type="password" /></div> : null}
          {message ? <p aria-live="polite" className={failed ? "text-sm text-destructive" : "text-sm text-emerald-700"} role={failed ? "alert" : "status"}>{message}</p> : null}
          {mode === "sign-in" ? <Link className="text-sm text-primary underline-offset-4 hover:underline" href={`/${locale}/forgot-password`}>{auth.forgotPassword}</Link> : null}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-4">
          <Button disabled={pending || (mode === "reset-password" && !token)} type="submit">{pending ? dictionary.common.loading : submitLabel}</Button>
          {mode === "sign-in" ? <p className="text-center text-sm text-muted-foreground">{auth.needAccount} <Link className="text-foreground underline" href={`/${locale}/sign-up`}>{auth.signUp}</Link></p> : null}
          {mode !== "sign-in" ? <p className="text-center text-sm text-muted-foreground">{auth.haveAccount} <Link className="text-foreground underline" href={`/${locale}/sign-in`}>{auth.signIn}</Link></p> : null}
        </CardFooter>
      </form>
    </Card>
  );
}
