import { sql } from "drizzle-orm";
import { customFieldValue as value } from "@/lib/db/schema";
import type { FieldConfig, FieldType, FieldValue } from "./field-contracts";

const textTypes: readonly string[] = ["text", "long_text", "email", "phone", "url"];
export function supportsConversion(source: FieldType, target: FieldType) {
  return source !== target && (
    textTypes.includes(source) && (textTypes.includes(target) || target === "multivalue") ||
    source === "multivalue" && textTypes.includes(target) ||
    source === "number" && target === "rating" || source === "rating" && target === "number" ||
    source === "select" && target === "multiselect" || source === "multiselect" && target === "select"
  );
}

/** Validate without normalizing: conversion must retain the exact source value. */
export function conversionRejection(source: FieldType, target: FieldType, config: FieldConfig, raw: FieldValue): string | null {
  if (!supportsConversion(source, target)) return "unsupported_conversion";
  if (raw === null) return null;
  let converted = raw;
  if (source === "multivalue" || source === "multiselect") {
    if (!Array.isArray(raw)) return "invalid_target_value";
    if (raw.length === 0) return "empty_array";
    if (raw.length !== 1) return "multiple_values";
    converted = raw[0];
  }
  if (target === "rating") return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= (config.ratingMax ?? 5) ? null : "invalid_target_value";
  if (target === "number") return typeof raw === "number" && Number.isFinite(raw) ? null : "invalid_target_value";
  if (target === "multiselect" || target === "select") return typeof converted === "string" && converted.length > 0 ? null : "invalid_target_value";
  if (typeof converted !== "string") return "invalid_target_value";
  if (target === "multivalue") return converted.length <= 2000 && converted.trim() === converted && converted.length > 0 ? null : "invalid_target_value";
  if (converted.length > 50000) return "invalid_target_value";
  if (target === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(converted)) return "invalid_target_value";
  if (target === "url") {
    try { if (!["https:", "http:"].includes(new URL(converted).protocol)) return "invalid_target_value"; }
    catch { return "invalid_target_value"; }
  }
  return null;
}

/** The expressions preserve SQL numbers directly, avoiding text/JSON round trips. */
export function conversionColumns(source: FieldType, target: FieldType) {
  if (source === "select" && target === "multiselect") return { optionId: null, jsonValue: sql<string | null>`case when ${value.optionId} is null then null else json_array(${value.optionId}) end` };
  if (source === "multiselect" && target === "select") return { jsonValue: null, optionId: sql<string | null>`json_extract(${value.jsonValue}, '$[0]')` };
  if (target === "multivalue") return { textValue: null, jsonValue: sql<string | null>`case when ${value.textValue} is null then null else json_array(${value.textValue}) end` };
  if (source === "multivalue") return { jsonValue: null, textValue: sql<string | null>`json_extract(${value.jsonValue}, '$[0]')` };
  if (target === "number" || target === "rating") return { numberValue: sql<number | null>`${value.numberValue}` };
  return { textValue: sql<string | null>`${value.textValue}` };
}
