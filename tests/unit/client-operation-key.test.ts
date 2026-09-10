import { describe, expect, it } from "vitest";
import {
  clientOperationKey,
  type PendingClientOperation,
} from "@/components/app/client-operation-key";

describe("client operation keys", () => {
  it("reuses a key for the same retry and rotates it when the payload changes", () => {
    const pending: { current: PendingClientOperation | null } = {
      current: null,
    };
    const first = clientOperationKey(pending, {
      action: "create",
      revision: 1,
    });
    expect(clientOperationKey(pending, { action: "create", revision: 1 })).toBe(
      first,
    );
    expect(
      clientOperationKey(pending, { action: "create", revision: 2 }),
    ).not.toBe(first);
  });
});
