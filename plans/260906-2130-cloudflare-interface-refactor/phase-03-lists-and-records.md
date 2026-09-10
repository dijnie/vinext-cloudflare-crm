# Lists and record surfaces

## Requirements

- Align entity page headers, search/filter toolbar, saved views, tables, pagination, create forms, record sheets, details, and activity surfaces.
- Keep query-string navigation, permissions, layouts, bulk actions, and mutation behavior unchanged.

## Files

- Shared list, table, form, and record-sheet components under `src/components/app/`

## Validation

- Lists and sheets browser group
- Record layout and CRM lifecycle groups

## Risk and rollback

Dense table and sheet changes can affect keyboard use and mobile overflow. Keep semantic table and dialog contracts intact.
