import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import { BadgeDollarSign, CalendarSync, User } from "lucide-react";

import { AdminPage } from "@/components/admin/admin-page";
import { APIDocumentation } from "@/components/admin/api-documentation";
import { CustomerService } from "@/lib/services/customer";
import { CustomerSubscriptionService } from "@/lib/services/customer_subscription";
import { SubscriptionService } from "@/lib/services/subscription";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminDashboardPage() {
  const customerService = new CustomerService(env.DB);
  const subscriptionService = new SubscriptionService(env.DB);
  const customerSubscriptionService = new CustomerSubscriptionService(env.DB);

  const [customers, subscriptions, customerSubscriptions] = await Promise.all([
    customerService.getAll(),
    subscriptionService.getAll(),
    customerSubscriptionService.getAll(),
  ]);

  const data = [
    {
      name: "Customers",
      value: customers.length,
      icon: User,
      href: "/admin/customers",
    },
    {
      name: "Subscriptions",
      value: subscriptions.length,
      icon: BadgeDollarSign,
      href: "/admin/subscriptions",
    },
    {
      name: "Customer Subscriptions",
      value: customerSubscriptions.length,
      icon: CalendarSync,
    },
  ];

  return (
    <AdminPage currentPath="/admin" title="Admin">
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
          {data.map((item) =>
            item.href ? (
              <div
                className="rounded-xl border bg-card text-card-foreground hover:bg-muted shadow transition-colors"
                key={item.name}
              >
                <a href={item.href}>
                  <div className="p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <div className="tracking-tight text-sm font-medium">
                        {item.name}
                      </div>
                      <item.icon />
                    </div>
                    <div className="pt-0">
                      <div className="text-2xl font-bold">{item.value}</div>
                    </div>
                  </div>
                </a>
              </div>
            ) : (
              <div
                className="rounded-xl border bg-card text-card-foreground shadow"
                key={item.name}
              >
                <div className="p-6">
                  <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="tracking-tight text-sm font-medium">
                      {item.name}
                    </div>
                    <item.icon />
                  </div>
                  <div className="pt-0">
                    <div className="text-2xl font-bold">{item.value}</div>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>

        <section className="space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">API</h2>
          <div>
            <APIDocumentation />
          </div>
        </section>
      </div>
    </AdminPage>
  );
}
