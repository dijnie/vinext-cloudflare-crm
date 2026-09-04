import { env } from "cloudflare:workers";
import { cache } from "react";

import { AdminPage } from "@/components/admin/admin-page";
import { RunCustomerWorkflowButton } from "@/components/admin/run-customer-workflow";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerService } from "@/lib/services/customer";

type CustomerPageProps = { params: Promise<{ id: string }> };

const getCustomer = cache(async (id: string) => {
  return new CustomerService(env.DB).getById(Number(id));
});

export async function generateMetadata({ params }: CustomerPageProps) {
  const { id } = await params;
  const customer = await getCustomer(id);
  return { title: customer.name };
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  const { id } = await params;
  const customer = await getCustomer(id);

  return (
    <AdminPage
      actions={
        <RunCustomerWorkflowButton
          apiToken={env.API_TOKEN}
          customerId={id}
        />
      }
      currentPath={`/admin/customers/${id}`}
      title={customer.name}
    >
      <h2 className="text-xl font-bold tracking-tight">Customer Details</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>Updated At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>{customer.name}</TableCell>
            <TableCell>{customer.email}</TableCell>
            <TableCell>{customer.notes}</TableCell>
            <TableCell>{customer.created_at}</TableCell>
            <TableCell>{customer.updated_at}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </AdminPage>
  );
}
