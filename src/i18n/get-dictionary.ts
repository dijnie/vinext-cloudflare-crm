const dictionaries = {
  vi: {
    title: "Công ty",
    empty: "Chưa có công ty",
    open: "Mở chi tiết",
    close: "Đóng",
    signInTitle: "Đăng nhập",
    signInDescription: "Đăng nhập bằng tài khoản email đã xác minh.",
  },
  en: {
    title: "Companies",
    empty: "No companies yet",
    open: "Open details",
    close: "Close",
    signInTitle: "Sign in",
    signInDescription: "Sign in with a verified email account.",
  },
} as const;

export type AppLocale = keyof typeof dictionaries;

export function isAppLocale(value: string): value is AppLocale {
  return value === "vi" || value === "en";
}

export function getDictionary(locale: AppLocale) {
  return dictionaries[locale];
}
