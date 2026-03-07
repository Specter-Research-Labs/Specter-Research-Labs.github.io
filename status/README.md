# Status Registry

Canonical source of truth for site-visible dossier/addenda status chips.

## Files
- `site/status/registry.json`: statuses, optional chips, and item metadata
- `site/status/registry.schema.json`: allowed values and structure
- `scripts/sync_status_chips.py`: validates and syncs bound HTML chips

## Workflow
1. Edit `site/status/registry.json`.
2. Sync chips:
   - apply changes: `python scripts/sync_status_chips.py --write --report`
   - check-only: `python scripts/sync_status_chips.py --check --report`
3. Commit updated registry and generated HTML.

## CI Guardrails
- `.github/workflows/status-registry.yml` runs `--check --report`.
- On pull requests it emits a warning and step summary when drift is detected.
- On `main` pushes (and Pages publish) drift fails the workflow.

## Dossier Statuses
- `concept`
- `active`
- `active-writing`
- `hold`

Optional dossier chips:
- `scope:expansion`
- `publication:preprint-pending`
- `publication:public`

## Addenda Statuses
- `concept`
- `active`
- `operational`
- `hold`
- `archived`

## Activity Timestamp
`last-activity:YYYY-MM-DD` chips are generated from git history using:

`git log -1 --format=%cs -- <item path>`

The path is declared per item in `registry.json`.
