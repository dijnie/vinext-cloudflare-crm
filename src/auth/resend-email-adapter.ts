import type { AuthEmailAdapter, AuthEmailMessage } from "./email-adapter";

interface ResendEmailAdapterOptions {
  apiKey: string;
  from: string;
  fetch?: typeof globalThis.fetch;
}

export class ResendEmailAdapter implements AuthEmailAdapter {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: ResendEmailAdapterOptions) {
    if (!options.apiKey || !options.from) {
      throw new Error("Resend email configuration is incomplete");
    }
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  sendVerification(message: AuthEmailMessage) {
    return this.send(message, "Verify your email", "Verify email");
  }

  sendPasswordReset(message: AuthEmailMessage) {
    return this.send(message, "Reset your password", "Reset password");
  }

  private async send(
    message: AuthEmailMessage,
    subject: string,
    action: string,
  ): Promise<void> {
    const response = await this.fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.options.from,
        to: [message.to],
        subject,
        text: `${action}: ${message.url}`,
      }),
    });

    if (!response.ok) {
      throw new Error("Transactional email delivery failed");
    }
  }
}
