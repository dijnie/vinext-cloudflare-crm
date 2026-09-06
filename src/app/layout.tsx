import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";

import "@fontsource-variable/geist";
import "@/styles/globals.css";

const themeScript = `
  const getThemePreference = () => {
    if (typeof localStorage !== "undefined" && localStorage.getItem("crm-theme")) {
      return localStorage.getItem("crm-theme");
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const isDark = getThemePreference() === "dark";
  document.documentElement.classList[isDark ? "add" : "remove"]("dark");

  if (typeof localStorage !== "undefined") {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      localStorage.setItem("crm-theme", isDark ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
`;

export const metadata: Metadata = {
  title: {
    default: "CRM",
    template: "%s - CRM",
  },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { width: "device-width" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await headers()).get("x-app-locale") === "en" ? "en" : "vi";
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
