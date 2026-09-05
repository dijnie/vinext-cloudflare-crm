import { describe, expect, it, vi } from "vitest";

import { CloudflareEmailAdapter } from "@/modules/auth/cloudflare-email-adapter";

describe("CloudflareEmailAdapter", () => {
  it("sends verification and reset links through the Worker binding", async () => {
    const send = vi.fn().mockResolvedValue({ messageId: "message-id" });
    const adapter = new CloudflareEmailAdapter({
      binding: { send } as unknown as SendEmail,
      from: "noreply@dijnie.dev",
    });

    await adapter.sendVerification({
      to: "owner@example.com",
      url: "https://crm.example/verify?token=one",
    });
    await adapter.sendPasswordReset({
      to: "owner@example.com",
      url: "https://crm.example/reset?token=two",
    });

    expect(send).toHaveBeenNthCalledWith(1, {
      to: "owner@example.com",
      from: { name: "CRM", email: "noreply@dijnie.dev" },
      subject: "Verify your email",
      text: "Verify email: https://crm.example/verify?token=one",
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      to: "owner@example.com",
      from: { name: "CRM", email: "noreply@dijnie.dev" },
      subject: "Reset your password",
      text: "Reset password: https://crm.example/reset?token=two",
    });
  });
});
