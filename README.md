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
> Version preview and production share the remote D1 selected in
> [wrangler.jsonc](wrangler.jsonc). Preview writes therefore affect production
> data. Local checks do not establish remote migration or deployment readiness.

<!-- dash-content-end -->

## Setup Steps

1. Install dependencies:

```bash
npm ci
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

3. Run the authoritative CRM migrations locally:

The development command applies local migrations before starting Vinext:

```bash
npm run dev
```

The source migration directory is `migrations/crm`. Apply it without starting
the development server with `npm run db:migrate:local`.

4. Build the application:

```bash
npm run build
```

Run browser checks against a fresh disposable local D1 database without supplying
account credentials:

```bash
npm run test:e2e:local
```

The [local browser runner](scripts/e2e-local.mjs) owns the complete default
browser matrix in fresh database groups, fixture provisioning, server startup,
and cleanup. It uses real Better Auth sign-up
and sign-in, seeding verified status only for its disposable fixture accounts
because the local email binding cannot deliver mail. These checks do not prove
email delivery. For list and record-sheet scenarios, pass the suite selector:

```bash
npm run test:e2e:local -- lists-and-sheets
```

For custom-field and saved-view journeys, use the selector
`npm run test:e2e:local -- custom-fields-and-saved-views`. The executable scenarios
live in [tests/e2e](tests/e2e).

### Verification and remote operations

The [package scripts](package.json) own the local checks, binding generation,
and deployment commands. `npm run check` covers the non-browser release gates;
browser checks use the disposable local runner above. Local mail fixtures do
not prove Cloudflare Email Service delivery or remote auth cookies.

The selected remote database already contains bootstrapped accounts and older
migration history. The fresh baseline in [migrations/crm](migrations/crm) cannot
be applied over that schema. Before any remote change, explicitly choose an
audited account-preserving transition or an approved reset with controlled
owner rebootstrap. Historical SQL files remain quarantined at the root of
[migrations](migrations); the configured migration discovery reads only
`migrations/crm`. Retain that older SQL until the cutover decision and operational
rollback checks are resolved. A retained Git revision alone does not verify
database recovery, and source cleanup does not alter the remote ledger.

The [migration runner](scripts/d1-migrations.mjs) prints the resolved target and
ledger. Inspect without applying changes:

```bash
node scripts/d1-migrations.mjs --target preview
```

Use `--target production` to inspect the production selection. Remote apply
requires the exact database ID acknowledgement as well as operational approval;
it still rejects incompatible migration history. See the runbook for the
conditional apply commands. `npm run start` uses the built Worker's local
migration configuration to keep preview data and schema in the same local store.

The stateful [cutover runbook](../plans/260904-0849-vinext-crm-rebuild/reports/crm-cutover-runbook.md)
records the selected targets, ledger collision, retained revision, backup and
write-freeze gates, preview smoke ownership, production approval, and rollback
decisions. It lives in the parent workspace's plans directory; a standalone
application checkout needs that release record from the operator.

Remote migrations are separate from deployment. Version upload, preview writes,
and production promotion require their respective operational approval. Use
version-scoped secrets for reviewed uploads; `wrangler secret put` immediately
deploys and is unsuitable for staging an unreviewed auth configuration.
Set `AUTH_BASE_URL` to the exact HTTPS origin being tested and verify its cookies
and email links before promotion. Preserve the existing auth secret when
preserving accounts and sessions.

Worker rollback changes code and bindings, not D1 contents. Because preview and
production share D1, a database Time Travel restore affects both and discards
writes after the chosen recovery point. Record that accepted loss boundary
before a restore; there is no automatic reset or zero-loss database rollback.

## Usage

Pages and API entry points live in `src/app`, reusable UI in `src/components`,
and business modules in `src/modules` (auth, CRM, currency, dashboard, fields,
members, and views). Shared database, server, localization, utilities, and styles
remain in their existing `src` directories.

Public auth is available under `/{locale}/sign-up`, `/{locale}/sign-in`,
`/{locale}/verify-email`, `/{locale}/forgot-password`, and
`/{locale}/reset-password`, where `locale` is `vi` or `en`. Authenticated users
enter the CRM at `/{locale}/{workspaceSlug}/companies`, with contact and deal
lists at the corresponding `/contacts` and `/deals` paths; owners can manage
members at `/{locale}/{workspaceSlug}/settings/members`. The workspace slug is canonical
for navigation but does not select or authorize data. Legacy sample admin and
REST implementations are removed; their old URLs remain unavailable with `404`
responses.

Authenticated active members can access the core CRM API under
`/api/crm/companies`, `/api/crm/contacts`, and `/api/crm/deals`. The route files
under [src/app/api/crm](src/app/api/crm) are the HTTP entry points; request validation
and list contracts are owned by [src/modules/crm/contracts](src/modules/crm/contracts).

For shareable list state and stable record-sheet links, start with
[parseListState](src/modules/crm/list-state.ts) and the
[list contract](src/modules/crm/contracts/list-contract.ts). Direct record entry points
are owned by [DirectRecordPage](src/components/crm/entity-list-page.tsx), and
sheet navigation by [the record-sheet components](src/components/crm/record-sheet).

Open a record sheet's Activities tab for manual activity logging, tasks, and
deal stage history. Start with [ActivityTimeline](src/components/crm/activity-timeline.tsx)
for the UI and [the activity contract](src/modules/crm/contracts/activity-contract.ts)
for API validation. Record assignment uses [OwnerPicker](src/components/crm/owner-picker.tsx)
and the [ownership API entry point](src/app/api/crm/ownership/route.ts); assignment
rules belong to [OwnershipService](src/modules/crm/ownership/ownership-service.ts).

All active members can manage custom fields from each list's field settings and
edit values in record sheets. Start with [FieldsSheet](src/components/crm/fields/fields-sheet.tsx)
and [RecordFields](src/components/crm/fields/record-fields.tsx); supported types
belong to [the field contract](src/modules/fields/field-contracts.ts), and SELECT/USER
list filters to [the field query owner](src/modules/fields/field-list-query.ts).

The field deletion dialog shows value coverage and requires the current password
and typed stable field key. Deletion retains the normalized definition, options,
values, and reserved key as a recoverable tombstone; there is no automatic purge.
Keep the displayed recovery ID for explicit recovery in field settings. Lifecycle
rules belong to [FieldService](src/modules/fields/field-service.ts), and password checking
to [verifyCurrentPassword](src/modules/auth/verify-current-password.ts).

Use [SavedViewsMenu](src/components/crm/saved-views-menu.tsx) to save and apply
private or shared list state. Every active member may create views; private views
remain creator-only, while shared views are readable by all members. Only the
original creator may edit, change sharing, or delete a view; membership removal
or record reassignment does not transfer that authority. See
[SavedViewService](src/modules/views/saved-view-service.ts) and
[the saved-state contract](src/modules/views/saved-view-contracts.ts).

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
[CurrencyService](src/modules/currency/currency-service.ts) for these rules and
[the conversion owner](src/modules/currency/conversion-service.ts) for exact money arithmetic.

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
[DashboardRepository](src/modules/dashboard/dashboard-repository.ts), with the response
contract in [dashboard-contracts](src/modules/dashboard/dashboard-contracts.ts).
