import { z } from "zod";
const customer = z
  .object({ companyId: z.uuid().optional(), contactId: z.uuid().optional() })
  .refine(
    (x) => Boolean(x.companyId) !== Boolean(x.contactId),
    "Choose one customer",
  );
export const reviewCreateInputSchema = z
  .object({
    source: z.string().trim().min(1).max(80),
    eventId: z.string().trim().min(1).max(255),
    content: z.string().trim().min(1).max(10000),
    rating: z.number().int().min(1).max(5),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  })
  .merge(customer)
  .strict();
export const reviewUpdateInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    content: z.string().trim().min(1).max(10000).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export const reviewRowSchema = z.object({
  id: z.uuid(),
  source: z.string(),
  eventId: z.string(),
  companyId: z.uuid().nullable(),
  contactId: z.uuid().nullable(),
  content: z.string(),
  rating: z.number(),
  tags: z.array(z.string()),
  revision: z.number(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const reviewListOutputSchema = z.object({
  rows: z.array(reviewRowSchema),
});
export type ReviewCreateInput = z.infer<typeof reviewCreateInputSchema>;
export type ReviewUpdateInput = z.infer<typeof reviewUpdateInputSchema>;
