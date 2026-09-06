import { expect, it } from "vitest";
import { activityModules } from "@/lib/services/modules/module-policy";

it("requires every present activity anchor without treating missing nullable links as modules", () => {
  expect(activityModules({})).toEqual([]);
  expect(activityModules({ companyId: null, contactId: "contact", dealId: undefined })).toEqual(["contact"]);
  expect(activityModules({ companyId: "company", contactId: "contact", dealId: "deal" })).toEqual(["company", "contact", "deal"]);
});
