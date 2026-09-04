import type { Metadata } from "next";
import { env } from "cloudflare:workers";

import { AdminPage } from "@/components/admin/admin-page";
import { CreateCustomerButton } from "@/components/admin/create-customer";
import { CustomersTable } from "@/components/admin/customers-table";
import { CustomerService } from "@/lib/services/customer";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  const customers = await new CustomerService(env.DB).getAll();

  return (
    <AdminPage
      actions={<CreateCustomerButton apiToken={env.API_TOKEN} />}
      currentPath="/admin/customers"
      title="Customers"
    >
      {customers.length ? (
        <CustomersTable data={customers} />
      ) : (
        <p className="font-medium text-muted-foreground">
          No customers yet. Try creating one using the API or by selecting
          &quot;Create New Customer&quot; above.
        </p>
      )}
    </AdminPage>
  );
}
