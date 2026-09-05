import { describe, expect, it } from "vitest";

import { canonicalWorkspacePath, localeFromPath, localizedPath, savedLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

describe("localized routes", () => {
  it("uses Vietnamese when a saved locale is missing or invalid", () => {
    expect(savedLocale(undefined)).toBe("vi");
    expect(savedLocale("fr")).toBe("vi");
    expect(savedLocale("en")).toBe("en");
  });

  it("recognizes only supported explicit locale segments", () => {
    expect(localeFromPath("/vi/crm/companies")).toBe("vi");
    expect(localeFromPath("/en/sign-in")).toBe("en");
    expect(localeFromPath("/api/auth/session")).toBeNull();
  });

  it("switches only the locale and preserves query state", () => {
    expect(localizedPath("/vi/crm/companies", "en", "?record=42&view=mine")).toBe("/en/crm/companies?record=42&view=mine");
  });

  it("preserves query state in canonical workspace redirects", () => {
    expect(canonicalWorkspacePath("vi", "crm", "?record=42")).toBe("/vi/crm/companies?record=42");
    expect(canonicalWorkspacePath("en", "crm", "?tab=active", "/settings/members")).toBe("/en/crm/settings/members?tab=active");
  });
});

describe("dictionaries", () => {
  it("provides matching locale contracts", () => {
    expect(getDictionary("vi").locale).toBe("vi");
    expect(getDictionary("en").locale).toBe("en");
    expect(Object.keys(getDictionary("vi"))).toEqual(Object.keys(getDictionary("en")));
  });
});
