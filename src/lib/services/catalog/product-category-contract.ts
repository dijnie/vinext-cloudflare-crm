import { z } from "zod";
const revision=z.number().int().nonnegative(),id=z.uuid(),label=z.string().trim().min(1).max(100);
export const productCategoryOutputSchema=z.object({id,label,position:z.number().int(),revision,archivedAt:z.iso.datetime().nullable()});
export const productCategoryCatalogSchema=z.object({revision,canManage:z.boolean(),categories:z.array(productCategoryOutputSchema)});
export const productCategoryMutationSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),revision,label}).strict(),
 z.object({action:z.literal("relabel"),revision,id,label}).strict(),
 z.object({action:z.literal("reorder"),revision,id,beforeId:id.nullable()}).strict(),
 z.object({action:z.literal("archive"),revision,id}).strict(),
 z.object({action:z.literal("restore"),revision,id}).strict(),
]);
export type ProductCategoryCatalog=z.infer<typeof productCategoryCatalogSchema>;
export type ProductCategoryMutation=z.infer<typeof productCategoryMutationSchema>;
