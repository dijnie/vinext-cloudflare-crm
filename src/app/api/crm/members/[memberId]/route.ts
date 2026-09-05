import { env } from "cloudflare:workers";
import { z } from "zod";

import {
  createCompositionRoot,
  type CompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";
import { HttpError } from "@/server/http-errors";
import { createRouteHandler } from "@/server/route-handler";

const memberIdSchema = z.string().trim().min(1).max(255);
const patchInputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("change-role"),
      role: z.enum(["owner", "member"]),
    })
    .strict(),
  z.object({ action: z.literal("restore") }).strict(),
]);
const deleteInputSchema = z
  .object({
    replacementMembershipId: memberIdSchema.nullish(),
  })
  .strict();

type RouteContext = { params: Promise<{ memberId: string }> };

async function parseMemberId(params: RouteContext["params"]): Promise<string> {
  const result = memberIdSchema.safeParse((await params).memberId);
  if (!result.success) {
    throw new HttpError(400, "validation_failed", "Member ID is invalid");
  }
  return result.data;
}

export async function PATCH(
  request: Request,
  { params }: RouteContext,
) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createMemberPatchHandler(root, params)(request);
}

export function createMemberPatchHandler(
  root: CompositionRoot,
  params: RouteContext["params"],
) {
  return createRouteHandler(root, {
    input: patchInputSchema,
    ownerOnly: true,
    unsafe: true,
    async handle({ context, input }) {
      const memberId = await parseMemberId(params);
      if (input.action === "restore") {
        await root.members.restore(context, memberId);
      } else {
        await root.members.changeRole(context, memberId, input.role);
      }
      return { success: true };
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: RouteContext,
) {
  const root = createCompositionRoot(env as RuntimeEnv);
  return createMemberDeleteHandler(root, params)(request);
}

export function createMemberDeleteHandler(
  root: CompositionRoot,
  params: RouteContext["params"],
) {
  return createRouteHandler(root, {
    input: deleteInputSchema,
    ownerOnly: true,
    unsafe: true,
    async handle({ context, input }) {
      const memberId = await parseMemberId(params);
      await root.members.remove(
        context,
        memberId,
        input.replacementMembershipId,
      );
      return { success: true };
    },
  });
}
