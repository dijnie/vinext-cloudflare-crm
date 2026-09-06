# Feature workspaces

## Requirements

- Apply the same page hierarchy and surface styling to dashboard, sales, scheduling, B2B, reporting, members, and settings.
- Preserve domain actions and validation.

## Files

- Feature components under `src/components/app/dashboard`, `sales`, `scheduling`, `b2b`, `reports`, `members`, and `settings`

## Validation

- Feature-specific browser groups
- Full unit and integration suites

## Risk and rollback

Feature screens vary in density. Prefer shared surface classes and primitives over component-specific visual rewrites.

