# Cloudflare-style CRM interface refactor

Status: in progress

## Outcome

Apply the visual system demonstrated by `../cloudflare.mhtml` across the CRM while preserving all existing business behavior, routes, accessibility names, API contracts, D1 data, and R2 file flows.

## Phases

1. [Design foundations](phase-01-design-foundations.md)
2. [Application shell](phase-02-application-shell.md)
3. [Lists and record surfaces](phase-03-lists-and-records.md)
4. [Feature workspaces](phase-04-feature-workspaces.md)
5. [Responsive visual verification](phase-05-verification.md)

## Dependencies

- Existing Vinext application and shared UI primitives
- `/home/dijnie/project/htlabs/cfcrm/cloudflare.mhtml` as the visual reference
- Existing Playwright acceptance groups

## Acceptance criteria

- Desktop navigation uses a readable Cloudflare-style sidebar and 58px utility header.
- Main content uses the reference's spacing, typography, blue actions, subtle canvas, cards, tables, and form controls.
- Every existing CRM route remains reachable and functionally unchanged.
- Mobile navigation, sheets, dialogs, forms, tables, and calendars remain usable without page-level horizontal overflow.
- Typecheck, unit, integration, build, Cloudflare dry-run, and relevant browser suites pass.
