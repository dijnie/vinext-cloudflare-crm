# Vinext CRM

<!-- dash-content-start -->

A CRM rebuild on Vinext, Shadcn UI, Cloudflare Workers, and D1. The current
compatibility slice proves verified email/password auth, singleton membership,
and a protected localized company route before the remaining CRM modules are
built.

## Features

- 🎨 Modern UI built with Vinext and Shadcn UI
- 🔐 Better Auth with mandatory email verification
- 👥 Singleton owner/member workspace
- 🏢 Protected localized company route
- 🚀 Deploy to Cloudflare Workers
- 📦 Powered by Cloudflare D1 database
- ✨ Clean, responsive interface
- 🔍 Data validation with Zod

## Tech Stack

- Frontend: [Vinext](https://github.com/cloudflare/vinext)
- UI Components: [Shadcn UI](https://ui.shadcn.com)
- Database: [Cloudflare D1](https://developers.cloudflare.com/d1)
- Deployment: [Cloudflare Workers](https://workers.cloudflare.com)
- Validation: [Zod](https://github.com/colinhacks/zod)

> [!IMPORTANT]
> Production publication remains blocked until the intended first owner can be
> bootstrapped safely. Open registration means the first verified account
> currently becomes owner.

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

Fill in the four auth and email values listed in `.dev.vars.example`. Keep the
canonical auth URL on HTTPS, including for local Workerd development.

3. Verify the D1 target already declared in `wrangler.jsonc` before applying
   migrations:

```bash
npx wrangler d1 info saas-admin
```

4. Run the database migrations locally:

The development command applies local migrations before starting Vinext:

```bash
npm run dev
```

5. Build the application:

```bash
npm run build
```

6. Before any remote migration or upload, choose and verify a controlled
   first-owner bootstrap procedure. Do not expose an empty database through a
   secret-configured preview or production version while this decision is open.

7. After that gate and explicit target/rollback verification, apply remote
   migrations separately from deployment:

```bash
npm run db:migrate:remote
```

Do not use `wrangler secret put` during bootstrap because it deploys
immediately. Upload and verify a non-production version first, then deploy the
exact reviewed version only after the intended owner exists.

## Usage

The current compatibility slice provides verified email/password auth and the
localized protected company route. Legacy sample admin and REST routes are
quarantined with `404` responses while their replacement is built.
