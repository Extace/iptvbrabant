# Hasura Project Layout

This directory contains the canonical Hasura project used as a template for whitelabel environments.

## Structure
```
hasura/
  config.yaml            # Hasura CLI config (env-substitution for endpoint & admin secret)
  migrations/           # Ordered Postgres schema & trigger migrations
  metadata/             # Hasura metadata (actions, permissions, relationships)
```

## Environment Variables
Set these before running commands:
- `HASURA_GRAPHQL_ENDPOINT` (e.g. https://<subdomain>.hasura.<region>.nhost.run/v1)
- `HASURA_GRAPHQL_ADMIN_SECRET`

## Common Commands (PowerShell)
```powershell
hasura migrate apply --endpoint $HASURA_GRAPHQL_ENDPOINT --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET --all-databases
hasura metadata apply --endpoint $HASURA_GRAPHQL_ENDPOINT --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
hasura migrate status --endpoint $HASURA_GRAPHQL_ENDPOINT --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
```

## Whitelabel Strategy
1. Keep this directory as the baseline template.
2. For brand-specific overrides, create `tenants/<brand>/metadata` and apply after baseline.
3. Avoid tenant-specific schema changes; prefer row-level permissions & metadata overrides.

## Updating Migrations
Generate new migration via CLI (from this folder):
```powershell
hasura migrate create "add_new_feature" --endpoint $HASURA_GRAPHQL_ENDPOINT --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET --database-name default
```
Then inspect, commit, and apply.

## Notes
- Original Nhost scaffold under `nhost/` retained for platform configuration.
- Do not duplicate config.yaml; use env variables for different deployments.
