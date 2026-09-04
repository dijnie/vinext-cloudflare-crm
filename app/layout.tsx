import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/styles/globals.css";

const themeScript = `
  const getThemePreference = () => {
    if (typeof localStorage !== "undefined" && localStorage.getItem("theme")) {
      return localStorage.getItem("theme");
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const isDark = getThemePreference() === "dark";
  document.documentElement.classList[isDark ? "add" : "remove"]("dark");

  if (typeof localStorage !== "undefined") {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      localStorage.setItem("theme", isDark ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }
`;

export const metadata: Metadata = {
  title: {
    default: "SaaS Admin Template",
    template: "%s - SaaS Admin Template",
  },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { width: "device-width" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
