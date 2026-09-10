import { describe, expect, it, vi } from "vitest";

import {
  runScheduled,
  type ScheduledServices,
} from "../../worker/scheduled-runner";

describe("scheduled runner", () => {
  it("continues later stages when an earlier stage fails", async () => {
    const calls: string[] = [];
    const root: ScheduledServices = {
      workspace: {
        cleanupDeletionObjects: vi.fn(async () => {
          calls.push("cleanup");
          throw new Error("cleanup failed");
        }),
      },
      integrations: {
        rewrapWebhookSecrets: vi.fn(async () => {
          calls.push("rewrap");
          return { processed: 0, failed: 0, remaining: 0 };
        }),
        dispatchOutbox: vi.fn(async () => {
          calls.push("dispatch");
        }),
        deliverDue: vi.fn(async () => {
          calls.push("deliver");
        }),
      },
    };
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await runScheduled(root, { send: vi.fn() });

    expect(calls).toEqual(["cleanup", "rewrap", "dispatch", "deliver"]);
    expect(error).toHaveBeenCalledWith(
      "Scheduled CRM stage failed",
      "workspace-cleanup",
      "cleanup failed",
    );
    error.mockRestore();
  });
});
