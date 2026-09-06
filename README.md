# Vinext CRM

<!-- dash-content-start -->

A CRM rebuild on Vinext, Shadcn UI, Cloudflare Workers, and D1. The current
foundation provides verified email/password auth, race-safe singleton membership,
the CRM database baseline, a Vietnamese/English application shell, owner-only
member settings, and guarded company, contact, and deal APIs.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dijnie/vinext-cloudflare-crm.git)

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

## Interface

The existing CRM screens use the original CRM's Geist typography, Carbon icons,
design tokens and Radix controls. Desktop navigation uses a compact icon rail;
Members and Currencies are inside Settings. The account menu contains theme
switching and sign-out. Mobile navigation opens a labeled drawer.

List search updates after typing; filters, sorting, columns and saved views use
menus. Record sheets support inline property edits, related-record navigation,
and an actions menu for full editing and archive/restore. The dashboard includes
charts and compact money labels with exact values available to assistive
technology and through the label tooltip. Vietnamese/English, password auth,
permissions and the existing D1 APIs remain the application contracts.

Shared controls live in `src/components/ui`; source-derived styles live in
`src/styles/globals.css`. Use the unified `radix-ui` package for modal, popover
and select controls so their focus scopes share one runtime. Source component
attribution is in [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).

## Branches and permission profiles

Owners manage branches, member assignments and action profiles at
`/{locale}/crm/settings/access`. Active members continue to read shared CRM
records; branch assignments organize the team and do not restrict record
visibility. Existing records are not assigned to a branch during upgrade.

The immutable standard profile preserves existing write capabilities for
existing memberships and newly verified signups. Owners can create profiles
with explicit create, edit, archive, restore, assignment, field-configuration
and saved-view permissions, then assign them to members. Export grants are
stored separately for export workflows; granting one does not add an export
feature. Administrative owner access and saved-view creator restrictions stay
independent from profiles. Changes are checked at service entry and again
atomically with writes, including ownership fields in create/edit requests.

A referenced profile cannot be deleted. Default or assigned branches cannot
be archived until owners change the default or move their member assignments.
Revocation removes branch assignments and sessions while preserving profile
configuration and historical authorship. Restoring membership does not restore
owner status or old branch assignments.

At `/{locale}/crm/settings/general`, members can read the business timezone and
country; owners can change them. Defaults are `Asia/Ho_Chi_Minh` and `VN`.
Concurrent saves use a revision check so a stale form cannot overwrite a newer
selection. System timestamps remain UTC instants; calendar dates and their
exclusive day-end boundaries use the configured zone, including daylight-saving
changes. The current opportunity dashboard retains its existing UTC periods;
new calendar workflows use the shared business-date helpers. Changing calendar
settings does not rewrite records, currency amounts or conversion history.

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

Sidebar navigation shows a skeleton inside the main content area instead of a
top loading banner. The previous page stays mounted but hidden and non-interactive
until navigation finishes; the header and sidebar remain available.

Smart Placement is enabled in `wrangler.jsonc` to let Cloudflare reduce Worker
round-trip latency to D1. It needs live traffic to evaluate placement; enabling
it alone is not proof of faster navigation. Compare authenticated route timings
after analysis (up to 15 minutes). To roll back, remove the `placement` field
and redeploy, or disable Placement in the dashboard and update the repo too.

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

Authentication checks read the current session/user together using Better Auth's
database joins, then read active membership on every protected request. Session
renewal writes are throttled to five minutes, with a one-hour lifetime from the
last renewal (idle expiry can be up to five minutes earlier than renewal on
every request). Cookie caching is not enabled: sign-out, password reset,
membership revocation and role changes still take effect on the next request.
The auth integration tests verify SQL counts, renewal and these security paths
against local D1; production navigation latency needs a post-deploy measurement.

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

Inside migration triggers, write `SELECT (CASE ... END);`: remote D1 can
misinterpret the unparenthesized `CASE` terminator as the trigger terminator and
return `incomplete input`. Parentheses preserve SQLite behavior. The script tests
compile all CRM migrations and guard this syntax; existing applied migration
names remain unchanged and must not be reset or replayed for this correction.

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

`npm run deploy` automatically inspects and applies pending CRM migrations to
the remote `DB` selected in `wrangler.jsonc`, verifies the ledger, then deploys
the Worker. Invoking this command authorizes those migrations for the configured
database; no per-deploy database ID flag is needed. In Cloudflare Builds, keep
the build command `npm run build` and deploy command `npm run deploy`. The build
token needs D1 write permission as well as Worker deployment permission.
Migration errors stop deployment; incompatible ledgers are never reset or
rewritten. Review migrations and backup/recovery policy before release: a later
deployment failure does not roll back an already-applied migration, so migrations
must remain compatible with the currently deployed Worker.

`npm run deploy -- --dry-run` and `--help` do not run migrations. Other argument
overrides are rejected so migration and deployment cannot select different
targets. Direct Wrangler commands and version uploads bypass this wrapper.
Standalone remote migration commands retain their exact-ID approval requirement.
Version upload, preview writes, and production promotion require their respective operational approval. Use
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

Pages and API entry points live in `src/app`; the Worker entry remains in
`worker/index.ts`. Application components live in `src/components/app`, with
shared UI primitives in `src/components/ui`.

The shared layout follows the Cloudflare CRM reference: `src/lib/auth`, `db`,
`email`, `http`, `i18n`, and `listing` hold infrastructure and list contracts.
Business services live under `src/lib/services`, grouped into activities,
companies, contacts, currencies, custom-fields, dashboard, deals, members,
saved-views, and shared helpers. `src/lib/composition-root.ts` wires the services.
Vinext routing and runtime conventions remain unchanged.

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
is owned by [lib/http](src/lib/http), with shared list contracts in
[lib/listing](src/lib/listing) and entity contracts beside their services.

For shareable list state and stable record-sheet links, start with
[parseListState](src/lib/listing/list-state.ts) and the
[list contract](src/lib/listing/list-contract.ts). Direct record entry points
are owned by [DirectRecordPage](src/components/app/entity-list-page.tsx), and
sheet navigation by [the record-sheet components](src/components/app/record-sheet).
Same-page filters, pagination, saved views, and record-sheet URL changes use
[client history navigation](src/components/app/list-navigation.ts). List and
record data still come from the existing guarded APIs; initial server rendering
and cross-path Vinext navigation remain in place. Record links retain deep URLs
and modified-click behavior without speculative prefetch. This behavior does
not establish a production latency improvement.

Open a record sheet's Activities tab for manual activity logging, tasks, and
deal stage history. Start with [ActivityTimeline](src/components/app/activity-timeline.tsx)
for the UI and [the activity contract](src/lib/services/activities/activity-contract.ts)
for API validation. Record assignment uses [OwnerPicker](src/components/app/owner-picker.tsx)
and the [ownership API entry point](src/app/api/crm/ownership/route.ts); assignment
rules belong to [OwnershipService](src/lib/services/members/ownership-service.ts).

All active members can manage custom fields from each list's field settings and
edit values in record sheets. Start with [FieldsSheet](src/components/app/fields/fields-sheet.tsx)
and [RecordFields](src/components/app/fields/record-fields.tsx); supported types
belong to [the field contract](src/lib/services/custom-fields/field-contracts.ts), and SELECT/USER
list filters to [the field query owner](src/lib/services/custom-fields/field-list-query.ts).

The field deletion dialog shows value coverage and requires the current password
and typed stable field key. Deletion retains the normalized definition, options,
values, and reserved key as a recoverable tombstone; there is no automatic purge.
Keep the displayed recovery ID for explicit recovery in field settings. Lifecycle
rules belong to [FieldService](src/lib/services/custom-fields/field-service.ts), and password checking
to [verifyCurrentPassword](src/lib/auth/verify-current-password.ts).

Use [SavedViewsMenu](src/components/app/saved-views-menu.tsx) to save and apply
private or shared list state. Every active member may create views; private views
remain creator-only, while shared views are readable by all members. Only the
original creator may edit, change sharing, or delete a view; membership removal
or record reassignment does not transfer that authority. See
[SavedViewService](src/lib/services/saved-views/saved-view-service.ts) and
[the saved-state contract](src/lib/services/saved-views/saved-view-contracts.ts).

### Currency and dashboard

Open the dashboard at `/{locale}/{workspaceSlug}` and currency settings at
`/{locale}/{workspaceSlug}/settings/currencies`. Start with
[DashboardSummary](src/components/app/dashboard/dashboard-summary.tsx) for the
shareable personal/everyone scope and
[CurrencySettings](src/components/app/settings/currency-settings.tsx) for owner-managed
rates and reporting currency.

VND is supported for deals and reporting currency. Enter VND amounts in whole
dong (for example, `100000` displays as `100.000 ₫` in Vietnamese), without a
fractional component. USD remains the default currency.

Rates are maintained manually; there is no external rate fetch. Manual rates take
precedence over any stored fetched rates. Frozen deal conversions keep reports
from drifting when rates change: updating a rate can fill missing conversions,
but does not revalue already converted deals. Original amounts and currencies,
including legacy unconverted records, are retained. See
[CurrencyService](src/lib/services/currencies/currency-service.ts) for these rules and
[the conversion owner](src/lib/services/currencies/conversion-service.ts) for exact money arithmetic.

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
[DashboardRepository](src/lib/services/dashboard/dashboard-repository.ts), with the response
contract in [dashboard-contracts](src/lib/services/dashboard/dashboard-contracts.ts).
s

Personal default views use `PUT /api/crm/saved-views/default` with `{ entity, viewId }`
(`viewId: null` clears the preference). Each active member can choose a visible
view for each entity, including a shared view created by someone else. This does
not grant permission to edit that view. A bare list URL opens the preferred
filters; explicit query parameters and direct record links take precedence.
Deleting a view or making it private clears other users' affected defaults.
The list reset link bypasses defaults so outdated field filters cannot trap a user.
