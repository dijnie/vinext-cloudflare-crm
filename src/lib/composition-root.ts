import { FileService } from "@/lib/services/files/file-service";
import { createAuth } from "@/lib/auth/auth";
import type { AuthEmailAdapter } from "@/lib/email/email-adapter";
import { CloudflareEmailAdapter } from "@/lib/email/cloudflare-email-adapter";
import { createDatabase } from "@/lib/db/database";
import { CompanyService } from "@/lib/services/companies/company-service";
import { ContactService } from "@/lib/services/contacts/contact-service";
import { DealService } from "@/lib/services/deals/deal-service";
import { ActivityService } from "@/lib/services/activities/activity-service";
import { OwnershipService } from "@/lib/services/members/ownership-service";
import { MemberService } from "@/lib/services/members/member-service";
import { SavedViewService } from "@/lib/services/saved-views/saved-view-service";
import { FieldService } from "@/lib/services/custom-fields/field-service";
import { DashboardService } from "@/lib/services/dashboard/dashboard-service";
import { CurrencyService } from "@/lib/services/currencies/currency-service";
import { AccessService } from "@/lib/services/permissions/access-service";
import { BusinessSettingsService } from "@/lib/services/settings/business-settings-service";

import { defaultSecurityLogger, type SecurityLogger } from "./http/security-logging";

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
    access: new AccessService(db, securityLogger),
    settings: new BusinessSettingsService(db, securityLogger),
    files: new FileService(db, runtimeBindings.CRM_FILES),
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
