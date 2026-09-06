# Responsive visual verification

## Requirements

- Render representative desktop and mobile routes and compare them with the reference system.
- Fix hierarchy, alignment, contrast, overflow, focus, and loading-state regressions.
- Update plan status with evidence.

## Validation

- Relevant Playwright groups
- `npm run check`
- Clean Git working tree after the final commit

## Risk and rollback

Visual fixes must not weaken tests or alter business contracts. Each earlier phase remains independently revertible.

