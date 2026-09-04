# Vinext CRM

<!-- dash-content-start -->

A CRM rebuild on Vinext, Shadcn UI, Cloudflare Workers, and D1. The current
foundation provides verified email/password auth, race-safe singleton membership,
the CRM database baseline, a Vietnamese/English application shell, owner-only
member settings, and guarded company, contact, and deal APIs.

## Features

- 🎨 Modern UI built with Vinext and Shadcn UI
- 🔐 Better Auth with mandatory email verification
- 👥 Singleton owner/member workspace
- 🗃️ CRM schema with no tenant key on CRM records
- 🛡️ Guarded request and member service boundaries
- 🌐 Vietnamese and English sign-up, sign-in, verification, and password-reset routes
- 🧭 Protected localized application shell with canonical cosmetic workspace URLs
- 👤 Owner-only localized member management
- 🏢 Localized company, contact, and deal lists with stable record sheets
- 📝 Manual activities, tasks, deal stage history, and record ownership
- 🧩 Custom fields and private/shared saved list views
- 🔗 Guarded company, contact, and deal APIs with archive/restore workflows
- 🚀 Deploy to Cloudflare Workers
- 📦 Powered by Cloudflare D1 database
- ✨ Clean, responsive interface
- 🔍 Data validation with Zod

## Tech Stack

- Frontend: [Vinext](https://github.com/cloudflare/vinext)
- UI Components: [Shadcn UI](https://ui.shadcn.com)
- Database: [Cloudflare D1](https://developers.cloudflare.com/d1)
- Transactional email: [Cloudflare Email Service](https://developers.cloudflare.com/email-service/)
- Deployment: [Cloudflare Workers](https://workers.cloudflare.com)
- Validation: [Zod](https://github.com/colinhacks/zod)

> [!IMPORTANT]
> Phase 1 is deployed to production with Cloudflare Email Service, and the
> intended first account is verified as the sole active owner. Open registration
> remains enabled; only an empty workspace assigns the first verified account as
> owner.

<!-- dash-content-end -->

## Setup Steps

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables:

```bash
# Create a .dev.vars file for local development
cp .dev.vars.example .dev.vars
```

Set `BETTER_AUTH_SECRET` to at least 32 random characters and keep
`AUTH_BASE_URL` on a canonical HTTPS origin. The sender address is a non-secret
Wrangler variable in `wrangler.jsonc`; its domain must already be onboarded in
Cloudflare Email Service. Change the variable and binding sender restriction
together when changing domains. Email delivery uses the native Worker binding;
no Resend account or API key is required.

3. Verify the D1 target already declared in `wrangler.jsonc` before applying
   migrations:

```bash
npx wrangler d1 info saas-admin
```

4. Run the authoritative CRM migrations locally:

The development command applies local migrations before starting Vinext:

```bash
npm run dev
```

The source migration directory is `migrations/crm`. Apply it without starting
the development server with `npm run db:migrate:local`.

5. Build the application:

```bash
npm run build
```

Run browser checks against a fresh disposable local D1 database without supplying
account credentials:

```bash
npm run test:e2e:local
```

The [local browser runner](scripts/e2e-local.mjs) owns fixture provisioning,
server startup, suite selection, and cleanup. It uses real Better Auth sign-up
and sign-in, seeding verified status only for its disposable fixture accounts
because the local email binding cannot deliver mail. These checks do not prove
email delivery. For list and record-sheet scenarios, pass the suite selector:

```bash
npm run test:e2e:local -- lists-and-sheets
```

For custom-field and saved-view journeys, use the selector
`npm run test:e2e:local -- custom-fields-and-saved-views`. The executable scenarios
live in [tests/e2e](tests/e2e).

6. Before any remote migration or upload for a fresh or reset database, define
   a controlled first-owner bootstrap procedure that verifies exactly the
   intended account holds the sole active owner membership. Production is
   already bootstrapped; do not repeat this procedure unless the database is
   intentionally reset.

7. After that gate and explicit target/rollback verification, apply preview
   migrations separately from deployment:

```bash
npm run db:migrate:preview
```

Because `preview_database_id` currently equals `database_id` in `wrangler.jsonc`,
this command targets the same selected remote D1 database as production. Do not
run it before its reset, backup, bookmark, and migration-ledger checks receive
explicit approval. `npm run deploy` does not apply remote migrations.

Do not use `wrangler secret put` during bootstrap because it deploys
immediately. Upload and verify a non-production version first, then deploy the
exact reviewed version only after the intended owner exists.

## Usage

Public auth is available under `/{locale}/sign-up`, `/{locale}/sign-in`,
`/{locale}/verify-email`, `/{locale}/forgot-password`, and
`/{locale}/reset-password`, where `locale` is `vi` or `en`. Authenticated users
enter the CRM at `/{locale}/{workspaceSlug}/companies`, with contact and deal
lists at the corresponding `/contacts` and `/deals` paths; owners can manage
members at `/{locale}/{workspaceSlug}/settings/members`. The workspace slug is canonical
for navigation but does not select or authorize data. Legacy sample admin and
REST routes remain quarantined with `404` responses.

Authenticated active members can access the core CRM API under
`/api/crm/companies`, `/api/crm/contacts`, and `/api/crm/deals`. The route files
under [app/api/crm](app/api/crm) are the HTTP entry points; request validation
and list contracts are owned by [src/crm/contracts](src/crm/contracts).

For shareable list state and stable record-sheet links, start with
[parseListState](src/crm/list-state.ts) and the
[list contract](src/crm/contracts/list-contract.ts). Direct record entry points
are owned by [DirectRecordPage](src/components/crm/entity-list-page.tsx), and
sheet navigation by [the record-sheet components](src/components/crm/record-sheet).

Open a record sheet's Activities tab for manual activity logging, tasks, and
deal stage history. Start with [ActivityTimeline](src/components/crm/activity-timeline.tsx)
for the UI and [the activity contract](src/crm/contracts/activity-contract.ts)
for API validation. Record assignment uses [OwnerPicker](src/components/crm/owner-picker.tsx)
and the [ownership API entry point](app/api/crm/ownership/route.ts); assignment
rules belong to [OwnershipService](src/crm/ownership/ownership-service.ts).

All active members can manage custom fields from each list's field settings and
edit values in record sheets. Start with [FieldsSheet](src/components/crm/fields/fields-sheet.tsx)
and [RecordFields](src/components/crm/fields/record-fields.tsx); supported types
belong to [the field contract](src/fields/field-contracts.ts), and SELECT/USER
list filters to [the field query owner](src/fields/field-list-query.ts).

The field deletion dialog shows value coverage and requires the current password
and typed stable field key. Deletion retains the normalized definition, options,
values, and reserved key as a recoverable tombstone; there is no automatic purge.
Keep the displayed recovery ID for explicit recovery in field settings. Lifecycle
rules belong to [FieldService](src/fields/field-service.ts), and password checking
to [verifyCurrentPassword](src/auth/verify-current-password.ts).

Use [SavedViewsMenu](src/components/crm/saved-views-menu.tsx) to save and apply
private or shared list state. Every active member may create views; private views
remain creator-only, while shared views are readable by all members. Only the
original creator may edit, change sharing, or delete a view; membership removal
or record reassignment does not transfer that authority. See
[SavedViewService](src/views/saved-view-service.ts) and
[the saved-state contract](src/views/saved-view-contracts.ts).

### Currency and dashboard

Open the dashboard at `/{locale}/{workspaceSlug}` and currency settings at
`/{locale}/{workspaceSlug}/settings/currencies`. Start with
[DashboardSummary](src/components/dashboard/dashboard-summary.tsx) for the
shareable personal/everyone scope and
[CurrencySettings](src/components/settings/currency-settings.tsx) for owner-managed
rates and reporting currency.

Rates are maintained manually; there is no external rate fetch. Manual rates take
precedence over any stored fetched rates. Frozen deal conversions keep reports
from drifting when rates change: updating a rate can fill missing conversions,
but does not revalue already converted deals. Original amounts and currencies,
including legacy unconverted records, are retained. See
[CurrencyService](src/currency/currency-service.ts) for these rules and
[the conversion owner](src/currency/conversion-service.ts) for exact money arithmetic.

Changing reporting currency is an explicit, resumable operation. The old reporting
currency and conversion version remain active until the whole operation finishes,
so reports never mix partially converted versions. Pending currency operations
temporarily block deal creation, money edits, and rate changes; resume or cancel
them in currency settings to release that lock. The durable constraints live in
[the currency migration](migrations/crm/0005_currency_conversion_versions.sql).

Dashboard money totals exclude archived and unconverted deals; missing conversions
are disclosed by count and currency instead of being presented as zero-valued
deals. Exact totals cross the API as decimal strings representing integer minor
units, avoiding JavaScript number precision loss. Query ownership is in
[DashboardRepository](src/dashboard/dashboard-repository.ts), with the response
contract in [dashboard-contracts](src/dashboard/dashboard-contracts.ts).
