import type { WebhookTransport } from "../src/lib/services/integrations/integration-service";

export interface ScheduledServices {
  workspace: { cleanupDeletionObjects(): Promise<unknown> };
  integrations: {
    rewrapWebhookSecrets(): Promise<{ processed: number; failed: number; remaining: number }>;
    dispatchOutbox(): Promise<unknown>;
    deliverDue(transport: WebhookTransport): Promise<unknown>;
  };
}

export async function runScheduled(root: ScheduledServices, transport: WebhookTransport): Promise<void> {
  const stages: Array<[string, () => Promise<unknown>]> = [
    ["workspace-cleanup", () => root.workspace.cleanupDeletionObjects()],
    ["webhook-rewrap", async () => {
      const status = await root.integrations.rewrapWebhookSecrets();
      if (status.processed || status.failed || status.remaining) console.info("Webhook rewrap status", status);
    }],
    ["outbox-dispatch", () => root.integrations.dispatchOutbox()],
    ["webhook-delivery", () => root.integrations.deliverDue(transport)],
  ];
  for (const [stage, execute] of stages) {
    try {
      await execute();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Scheduled CRM stage failed", stage, message.slice(0, 500));
    }
  }
}
