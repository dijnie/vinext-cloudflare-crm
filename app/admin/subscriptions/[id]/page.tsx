import { env } from "cloudflare:workers";
import { cache } from "react";

import { AdminPage } from "@/components/admin/admin-page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionService } from "@/lib/services/subscription";

type SubscriptionPageProps = { params: Promise<{ id: string }> };

const getSubscription = cache(async (id: string) => {
  return new SubscriptionService(env.DB).getById(id);
});

export async function generateMetadata({ params }: SubscriptionPageProps) {
  const { id } = await params;
  const subscription = await getSubscription(id);
  return { title: subscription.name };
}

export default async function SubscriptionPage({
  params,
}: SubscriptionPageProps) {
  const { id } = await params;
  const subscription = await getSubscription(id);

  return (
    <AdminPage
      currentPath={`/admin/subscriptions/${id}`}
      title={subscription.name}
    >
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Subscription Details
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Updated At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>{subscription.name}</TableCell>
                <TableCell>{subscription.description}</TableCell>
                <TableCell>{subscription.price}</TableCell>
                <TableCell>{subscription.created_at}</TableCell>
                <TableCell>{subscription.updated_at}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight">Features</h2>

          {!subscription.features || subscription.features.length === 0 ? (
            <p className="font-medium text-muted-foreground">
              No features added for this subscription.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscription.features.map(
                  (feature: { name: string; description?: string }, index: number) => (
                    <TableRow key={index}>
                      <TableCell>{feature.name}</TableCell>
                      <TableCell>{feature.description}</TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AdminPage>
  );
}
