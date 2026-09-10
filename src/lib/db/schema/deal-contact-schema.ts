import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import { contact } from "./contact-schema";
import { deal } from "./deal-schema";

export const dealContact = sqliteTable(
  "deal_contact",
  {
    dealId: text("deal_id")
      .notNull()
      .references(() => deal.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    role: text("role"),
  },
  (table) => [
    primaryKey({ columns: [table.dealId, table.contactId] }),
    index("deal_contact_contact_idx").on(table.contactId),
  ],
);
