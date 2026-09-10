# Application shell

## Requirements

- Replace the desktop icon rail with a 260px grouped navigation sidebar.
- Match the reference utility header, active navigation, content width, and responsive drawer behavior.
- Keep locale, notifications, account, theme, sign-out, prefetch, and navigation loading behavior.

## Files

- `src/components/app/app-shell.tsx`
- `src/components/app/shell-logo.tsx`
- Shell dictionaries and browser tests when needed

## Validation

- Shell interaction browser tests
- Mobile overflow and navigation checks

## Risk and rollback

Navigation is shared by all authenticated routes. Preserve accessible labels and exact route matching.
