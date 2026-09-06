import { ProductService } from "@/lib/services/catalog/product-service";
import { ProductCategoryService } from "@/lib/services/catalog/product-category-service";
import { OrderService } from "@/lib/services/orders/order-service";
import { OrderCommandService } from "@/lib/services/orders/order-command-service";
import { PaymentService } from "@/lib/services/payments/payment-service";
import { InventoryService } from "@/lib/services/inventory/inventory-service";
import { EntitlementService } from "@/lib/services/entitlements/entitlement-service";
import { LeadService } from "@/lib/services/leads/lead-service";
import { LeadSettingsService } from "@/lib/services/leads/lead-settings-service";
import { LeadConversionService } from "@/lib/services/conversions/lead-conversion-service";
import { LeadMappingService } from "@/lib/services/conversions/lead-mapping-service";
import { DealStageService } from "@/lib/services/deals/deal-stage-service";
import { LayoutService } from "@/lib/services/layouts/layout-service";
import { DraftService } from "@/lib/services/record-drafts/draft-service";
import { ModuleService } from "@/lib/services/modules/module-service";
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
import { TaskService } from "@/lib/services/tasks/task-service";
import { AppointmentService } from "@/lib/services/appointments/appointment-service";
import { TicketService } from "@/lib/services/tickets/ticket-service";
import { NotificationService } from "@/lib/services/notifications/notification-service";
import { ContractService } from "@/lib/services/contracts/contract-service";
import { ContractDocumentService } from "@/lib/services/contracts/contract-document-service";
import { ReviewService } from "@/lib/services/reviews/review-service";
import { ReportService } from "@/lib/services/reports/report-service";
import { ReportExportService } from "@/lib/services/exports/report-export-service";

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
    reportExports: new ReportExportService(db),
    reports: new ReportService(db),
    reviews: new ReviewService(db),
    contractDocuments: new ContractDocumentService(db, runtimeBindings.CRM_FILES),
    contracts: new ContractService(db),
    notifications: new NotificationService(db),
    tickets: new TicketService(db),
    appointments: new AppointmentService(db),
    tasks: new TaskService(db, activities),
    orders: new OrderService(db),
    orderCommands: new OrderCommandService(db),
    payments: new PaymentService(db),
    inventory: new InventoryService(db),
    entitlements: new EntitlementService(db),
    products: new ProductService(db),
    productCategories: new ProductCategoryService(db),
    leads: new LeadService(db),
    leadSettings: new LeadSettingsService(db),
    leadConversions: new LeadConversionService(db),
    leadMapping: new LeadMappingService(db),
    access: new AccessService(db, securityLogger),
    settings: new BusinessSettingsService(db, securityLogger),
    modules: new ModuleService(db),
    dealStages: new DealStageService(db),
    layouts: new LayoutService(db),
    drafts: new DraftService(db),
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
