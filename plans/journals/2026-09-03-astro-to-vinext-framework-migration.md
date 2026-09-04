---
title: Astro to Vinext framework migration
date: 2026-09-03
summary: "Ported the SaaS admin template to Vinext while preserving Cloudflare D1, API, Workflow, and UI contracts."
---

# Astro to Vinext framework migration

## What happened

- Replaced Astro pages and runtime configuration with Vinext App Router, Vite, and a custom Cloudflare Worker entry.
- Preserved six HTML routes, nine API method/path contracts, D1 services, API token validation, and the `CustomerWorkflow` named export.
- Verified typecheck, build, Cloudflare deploy dry-run, local API and Workflow behavior, production runtime, and browser interactions.

## Decisions

- Kept scope framework-only; pre-existing product and UX quirks remain unchanged.
- Pinned the current Vinext beta stack to versions proven together in this checkout.
- Kept visitor-local date formatting after hydration instead of forcing a server locale.

## Root cause learned

Vinext build generates a separate Wrangler config. Wrangler resolves local D1 persistence relative to that generated config, so the source-config database and production-preview database are separate. The start command now applies migrations through the generated config before serving.

## Next steps

- Commit the verified migration if approved.
- Deploy only as a separate authorized action because deploy runs remote D1 migrations.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
