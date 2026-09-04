# Vinext CRM

<!-- dash-content-start -->

A CRM rebuild on Vinext, Shadcn UI, Cloudflare Workers, and D1. The current
foundation provides verified email/password auth, race-safe singleton membership,
the CRM database baseline, a Vietnamese/English application shell, owner-only
member settings, and guarded server service boundaries.

## Features

- 🎨 Modern UI built with Vinext and Shadcn UI
- 🔐 Better Auth with mandatory email verification
- 👥 Singleton owner/member workspace
- 🗃️ CRM schema with no tenant key on CRM records
- 🛡️ Guarded request and member service boundaries
- 🌐 Vietnamese and English sign-up, sign-in, verification, and password-reset routes
- 🧭 Protected localized application shell with canonical cosmetic workspace URLs
- 👤 Owner-only localized member management
- 🏢 Protected localized company route
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

The public localized-auth browser scenario can run without account credentials:

```bash
E2E_BASE_URL=https://localhost:8787 npm run test:e2e -- auth-and-members.spec.ts -g "localized auth routes preserve locale state"
```

The authenticated owner/member scenarios require deterministic accounts in the
isolated E2E D1 database. Set `E2E_BASE_URL`, `E2E_OWNER_EMAIL`,
`E2E_OWNER_PASSWORD`, `E2E_MEMBER_EMAIL`, and `E2E_MEMBER_PASSWORD`, then run:

```bash
npm run test:e2e -- auth-and-members.spec.ts
```

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
enter the CRM at `/{locale}/{workspaceSlug}/companies`; owners can manage members
at `/{locale}/{workspaceSlug}/settings/members`. The workspace slug is canonical
for navigation but does not select or authorize data. Legacy sample admin and
REST routes remain quarantined with `404` responses.
