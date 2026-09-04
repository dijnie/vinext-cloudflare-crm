import { createAuth } from "@/auth/auth";
import type { AuthEmailAdapter } from "@/auth/email-adapter";
import { CloudflareEmailAdapter } from "@/auth/cloudflare-email-adapter";
import { createDatabase } from "@/db/client";
import { CompanyService } from "@/crm/companies/company-service";
import { ContactService } from "@/crm/contacts/contact-service";
import { DealService } from "@/crm/deals/deal-service";
import { ActivityService } from "@/crm/activities/activity-service";
import { OwnershipService } from "@/crm/ownership/ownership-service";
import { MemberService } from "@/members/member-service";

import { defaultSecurityLogger, type SecurityLogger } from "./security-logging";

export interface RuntimeEnv extends Cloudflare.Env {
  BETTER_AUTH_SECRET: string;
  AUTH_BASE_URL: string;
  AUTH_EMAIL_FROM: string;
  EMAIL: SendEmail;
}

export function createCompositionRoot(
  runtimeBindings: RuntimeEnv,
  emailAdapter: AuthEmailAdapter = new CloudflareEmailAdapter({
    binding: runtimeBindings.EMAIL,
    from: runtimeBindings["AUTH_EMAIL_FROM"],
  }),
  securityLogger: SecurityLogger = defaultSecurityLogger,
) {
  const db = createDatabase(runtimeBindings.DB);
  const auth = createAuth(
    db,
    {
      secret: runtimeBindings["BETTER_AUTH_SECRET"],
      baseUrl: runtimeBindings["AUTH_BASE_URL"],
    },
    emailAdapter,
  );
  const members = new MemberService(db, securityLogger);
  const companies = new CompanyService(db);
  const contacts = new ContactService(db);
  const deals = new DealService(db);
  const activities = new ActivityService(db);
  const ownership = new OwnershipService(db);
  return {
    activities,
    auth,
    companies,
    contacts,
    db,
    deals,
    env: runtimeBindings,
    members,
    ownership,
    securityLogger,
  };
}

export type CompositionRoot = ReturnType<typeof createCompositionRoot>;
