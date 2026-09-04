import { describe, expect, it } from "vitest";

import { relationError } from "@/crm/service-utils";
import { HttpError } from "@/server/http-errors";

describe("CRM service database errors", () => {
  it.each([
    "deal contact company mismatch",
    "contact company conflicts with a deal",
    "deal company conflicts with a contact",
  ])("maps %s to a stable conflict", (message) => {
    expect.assertions(2);
    const cause = new Error(message);
    const wrapper = new Error("Failed query", { cause });

    try {
      relationError(wrapper, "Relationship conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({ status: 409, code: "conflict" });
    }
  });
});
