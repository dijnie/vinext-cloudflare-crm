import type { EntityType } from "./list-state";
export const mutationSurfaces = {
  product: ["records", "lists", "facets", "timeline", "dashboard", "settings"],
  lead: ["records", "lists", "facets", "timeline", "dashboard", "settings"],
  stages: ["records", "lists", "facets", "settings", "timeline", "dashboard"],
  modules: ["records", "lists", "facets", "settings", "timeline", "dashboard"],
  company: ["records", "lists", "facets", "dashboard"],
  contact: ["records", "lists", "facets", "dashboard"],
  deal: ["records", "lists", "facets", "timeline", "dashboard"],
  activity: ["records", "lists", "timeline", "dashboard"],
  ownership: ["records", "lists", "facets", "settings", "dashboard"],
  fields: ["records", "lists", "facets", "settings"],
  views: ["lists", "settings"], currency: ["records", "lists", "settings", "dashboard"],
} as const;
export function invalidateCrm(kind: EntityType | keyof typeof mutationSurfaces) {
  window.dispatchEvent(new CustomEvent("crm:invalidate", { detail: { kind, surfaces: mutationSurfaces[kind] } }));
}
