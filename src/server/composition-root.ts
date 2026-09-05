import { createAuth } from "@/modules/auth/auth";
import type { AuthEmailAdapter } from "@/modules/auth/email-adapter";
import { CloudflareEmailAdapter } from "@/modules/auth/cloudflare-email-adapter";
import { createDatabase } from "@/db/client";
import { CompanyService } from "@/modules/crm/companies/company-service";
import { ContactService } from "@/modules/crm/contacts/contact-service";
import { DealService } from "@/modules/crm/deals/deal-service";
import { ActivityService } from "@/modules/crm/activities/activity-service";
import { OwnershipService } from "@/modules/crm/ownership/ownership-service";
import { MemberService } from "@/modules/members/member-service";
import { SavedViewService } from "@/modules/views/saved-view-service";
import { FieldService } from "@/modules/fields/field-service";
import { DashboardService } from "@/modules/dashboard/dashboard-service";
import { CurrencyService } from "@/modules/currency/currency-service";

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
  const views = new SavedViewService(db);
  const fields = new FieldService(db);
  const dashboard = new DashboardService(db);
  const currency = new CurrencyService(db);
  return {
    currency,
    dashboard,
    fields,
    views,
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
