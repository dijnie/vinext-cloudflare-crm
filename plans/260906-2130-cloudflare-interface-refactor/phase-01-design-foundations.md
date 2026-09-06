# Design foundations

## Requirements

- Translate the reference palette, typography, border, radius, shadow, spacing, focus, and control treatments into existing tokens and primitives.
- Preserve dark mode with equivalent contrast.
- Avoid Cloudflare trademarks and product copy.

## Files

- `src/styles/globals.css`
- Shared components under `src/components/ui/`

## Validation

- Typecheck and build
- Primitive consumers render without contract changes

## Risk and rollback

Token changes affect every route. Roll back this phase commit independently if contrast or component regressions appear.

