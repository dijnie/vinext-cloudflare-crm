import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

type Env = {
  CUSTOMER_WORKFLOW: WorkflowEntrypoint<Env, Params>;
  DB: D1Database;
};

type Params = {
  id: string;
};

type Customer = {
  id: number;
  name: string;
  email: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export class CustomerWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { DB } = this.env;
    const { id } = event.payload;

    const customer = await step.do("fetch customer", async () => {
      return DB.prepare(`SELECT * FROM customers WHERE id = ?`)
        .bind(id)
        .first<Customer>();
    });

    if (customer) {
      await step.do("conditional customer step", async () => {
        console.log(
          "A customer was found! This step only runs if a customer is found.",
        );
        console.log(customer);
      });
    }

    await step.do("example step", async () => {
      console.log(
        "This step always runs, and is the last step in the workflow.",
      );
    });
  }
}
