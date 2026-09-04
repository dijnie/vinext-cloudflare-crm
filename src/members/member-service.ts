import type { AppDatabase } from "@/db/client";
import { HttpError } from "@/server/http-errors";
import type { RequestContext } from "@/server/request-context";
import {
  defaultSecurityLogger,
  type SecurityLogger,
} from "@/server/security-logging";

import { MemberRepository } from "./member-repository";
import { requireOwnerRole, resolveRemovalReplacement } from "./member-policy";

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
      if (!(await this.repository.changeRole(context.membershipId, targetMembershipId, role))) {
        throw new HttpError(404, "not_found", "Active member was not found");
      }
      this.logSuccess(context, "membership.role_changed");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(409, "conflict", "The workspace must keep an owner");
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
      throw new HttpError(400, "validation_failed", "Replacement must be an active member");
    }
    try {
      if (!(await this.repository.remove(context.membershipId, targetMembershipId, replacement))) {
        throw new HttpError(404, "not_found", "Active member was not found");
      }
      this.logSuccess(context, "membership.removed");
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(409, "conflict", "Member removal cannot preserve all invariants");
    }
  }

  async restore(context: RequestContext, targetMembershipId: string): Promise<void> {
    requireOwnerRole(context);
    if (!(await this.repository.restore(context.membershipId, targetMembershipId))) {
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
