import type { AuthEmailAdapter, AuthEmailMessage } from "./email-adapter";

interface CloudflareEmailAdapterOptions {
  binding: SendEmail;
  from: string;
}

export class CloudflareEmailAdapter implements AuthEmailAdapter {
  constructor(private readonly options: CloudflareEmailAdapterOptions) {
    if (!options.binding || !options.from) {
      throw new Error("Cloudflare Email Service configuration is incomplete");
    }
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
    await this.options.binding.send({
      to: message.to,
      from: { name: "CRM", email: this.options.from },
      subject,
      text: `${action}: ${message.url}`,
    });
  }
}
