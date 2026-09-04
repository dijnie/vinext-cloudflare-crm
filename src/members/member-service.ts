import type { AppDatabase } from "@/db/client";
import { HttpError } from "@/server/http-errors";
import type { RequestContext } from "@/server/request-context";
import {
  defaultSecurityLogger,
  type SecurityLogger,
} from "@/server/security-logging";

import { MemberRepository } from "./member-repository";
import { requireOwnerRole, resolveRemovalReplacement } from "./member-policy";

function databaseMessage(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof Error) messages.push(current.message);
    current = "cause" in current ? current.cause : null;
  }
  return messages.join(" ").toLowerCase();
}

export class MemberService {
  private readonly repository: MemberRepository;

  constructor(
    db: AppDatabase,
    private readonly securityLogger: SecurityLogger = defaultSecurityLogger,
  ) {
    this.repository = new MemberRepository(db);
  }

  async list(context: RequestContext) {
    requireOwnerRole(context);
    const members = await this.repository.list();
    this.logSuccess(context, "membership.listed");
    return members;
  }

  async changeRole(
    context: RequestContext,
    targetMembershipId: string,
    role: "owner" | "member",
  ): Promise<void> {
    requireOwnerRole(context);
    try {
      if (
        !(await this.repository.changeRole(
          context.membershipId,
          targetMembershipId,
          role,
        ))
      ) {
        throw new HttpError(404, "not_found", "Active member was not found");
      }
      this.logSuccess(context, "membership.role_changed");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (databaseMessage(error).includes("last owner protected")) {
        throw new HttpError(
          409,
          "conflict",
          "The workspace must keep an owner",
        );
      }
      throw error;
    }
  }

  async remove(
    context: RequestContext,
    targetMembershipId: string,
    replacementMembershipId?: string | null,
  ): Promise<void> {
    requireOwnerRole(context);
    const replacement = resolveRemovalReplacement(
      context,
      targetMembershipId,
      replacementMembershipId,
    );
    if (replacement && !(await this.repository.findActive(replacement))) {
      throw new HttpError(
        400,
        "validation_failed",
        "Replacement must be an active member",
      );
    }
    if (
      replacement === null &&
      (await this.repository.hasOwnedDeals(targetMembershipId))
    ) {
      throw new HttpError(
        409,
        "conflict",
        "Deals require an active replacement owner",
      );
    }
    try {
      if (
        !(await this.repository.remove(
          context.membershipId,
          targetMembershipId,
          replacement,
        ))
      ) {
        throw new HttpError(404, "not_found", "Active member was not found");
      }
      this.logSuccess(context, "membership.removed");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const message = databaseMessage(error);
      if (
        message.includes("membership references require cleanup") ||
        message.includes("deal company and owner are required") ||
        message.includes("last owner protected") ||
        message.includes("check constraint failed: authorized")
      ) {
        throw new HttpError(
          409,
          "conflict",
          "Member removal cannot preserve all invariants",
        );
      }
      throw error;
    }
  }

  async restore(
    context: RequestContext,
    targetMembershipId: string,
  ): Promise<void> {
    requireOwnerRole(context);
    if (
      !(await this.repository.restore(context.membershipId, targetMembershipId))
    ) {
      throw new HttpError(404, "not_found", "Revoked member was not found");
    }
    this.logSuccess(context, "membership.restored");
  }

  private logSuccess(context: RequestContext, code: string): void {
    this.securityLogger({
      code,
      requestId: context.requestId,
      method: "SERVICE",
      outcome: "succeeded",
    });
  }
}
