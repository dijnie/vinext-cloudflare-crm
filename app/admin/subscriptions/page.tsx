import type { Metadata } from "next";
import { env } from "cloudflare:workers";

import { AdminPage } from "@/components/admin/admin-page";
import { CreateSubscriptionButton } from "@/components/admin/create-subscription";
import { SubscriptionsTable } from "@/components/admin/subscriptions-table";
import { SubscriptionService } from "@/lib/services/subscription";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const subscriptions = await new SubscriptionService(env.DB).getAll();

  return (
    <AdminPage
      actions={<CreateSubscriptionButton apiToken={env.API_TOKEN} />}
      currentPath="/admin/subscriptions"
      title="Subscriptions"
    >
      {subscriptions.length ? (
        <SubscriptionsTable data={subscriptions} />
      ) : (
        <p className="font-medium text-muted-foreground">
          No subscriptions yet. Try creating one using the API or by selecting
          &quot;Create New Subscription&quot; above.
        </p>
      )}
    </AdminPage>
  );
}
