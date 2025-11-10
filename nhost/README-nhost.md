# Nhost Project Configuration (Manual Setup)

This folder was created manually because the Nhost CLI was not available (package name collision on npm).

Structure:
- `config.yaml` – Base configuration (fill in YOUR_SUBDOMAIN and ensure region matches your project)
- `hasura/metadata` – Hasura metadata will go here once exported
- `hasura/migrations` – SQL migrations you create manually

## Next Steps
1. In the Nhost dashboard, confirm your project subdomain & region. Update `config.yaml`.
2. Add an `.env` (not committed) or `.env.example` in repo root including:
   ```
   HASURA_GRAPHQL_ADMIN_SECRET=replace_me
   ```
3. To create an orders table manually, add a migration file under `nhost/hasura/migrations/` named e.g. `0001_create_orders.sql` with:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   CREATE TABLE public.orders (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     klanttype text,
     naam text,
     telefoon text,
     email text,
     producten text,
     totaal text,
     opmerkingen text,
     created_at timestamptz DEFAULT now()
   );
   ```
4. Commit and push so Nhost applies it (if your project is set to auto-apply migrations/metadata from the repo). If not, you can apply via dashboard or future CLI.

## Hasura Metadata (Manual)
Create JSON/YAML metadata files under `hasura/metadata` (tables.yaml, sources.yaml). For a single Postgres source you’d minimally define a source referencing your database. You can export metadata from the Nhost dashboard and convert to files here later.

## Without CLI
You can still interact with GraphQL & Auth from the front-end via the SDK (`@nhost/nhost-js`). Install SDK:
```powershell
# If you use a bundler or Node-based toolchain
npm install @nhost/nhost-js graphql
```

Then create `js/nhostClient.js`:
```javascript
// Or use CDN if you don't have a bundler
import { NhostClient } from 'https://cdn.jsdelivr.net/npm/@nhost/nhost-js@latest/dist/index.mjs';
export const nhost = new NhostClient({ subdomain: 'YOUR_SUBDOMAIN', region: 'eu-west-2' });
```

Insert order example (after form submit):
```javascript
const mutation = `mutation InsertOrder($obj: orders_insert_input!) { insert_orders_one(object: $obj) { id } }`;
const result = await nhost.graphql.request(mutation, { obj: { klanttype, naam, telefoon, email, producten, totaal, opmerkingen } });
if (result.error) console.error(result.error);
```

## Rename Folder (Optional)
If you previously created a capital `Nhost` folder, remove or rename it to `nhost` (lowercase is conventional).

## Troubleshooting CLI
The npm package you installed (`nhost@0.1.11`) is NOT the official Nhost CLI (no `bin` field). Until the official CLI is published under a distinct name again, continue with manual setup + SDK.

