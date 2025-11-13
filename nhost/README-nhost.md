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
3. To create an orders table manually (now relocated), add a migration file under `hasura/migrations/` named e.g. `0001_create_orders.sql` with:
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

Client usage (no bundler)
The repo includes `js/nhostClient.v20251112d.js` which posts directly to the Nhost GraphQL endpoint without importing the SDK (avoids CDN MIME/CORS issues on static hosting). It defines `window.saveOrderNhost(order)`.

Minimal direct fetch example:
```javascript
const GQL_ENDPOINT = 'https://<subdomain>.graphql.<region>.nhost.run/v1';
const mutation = `mutation InsertOrder($object: orders_insert_input!) { insert_orders_one(object: $object) { id } }`;
const res = await fetch(GQL_ENDPOINT, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ query: mutation, variables: { object: order } })
});
const json = await res.json();
```

## Rename Folder (Optional)
If you previously created a capital `Nhost` folder, remove or rename it to `nhost` (lowercase is conventional).

## Troubleshooting CLI
The npm package you installed (`nhost@0.1.11`) is NOT the official Nhost CLI (no `bin` field). Until the official CLI is published under a distinct name again, continue with manual setup + SDK.

## New Admin Schema (Customers & Subscriptions)
Migrations now live under `hasura/migrations/`:
- `0005_create_customers.sql`
- `0006_create_subscriptions.sql`
- `0007_create_subscription_adjustments.sql`
- `0008_create_referrals.sql`

After these run on your Nhost Postgres:
1) In the Hasura console, track these new tables so they appear in GraphQL.
2) Set permissions:
   - Role `admin`: full CRUD on all new tables.
   - Role `public` (or your unauthorized role): no access to these tables (orders insert remains as-is).
3) Optional: create relationships (Hasura usually infers from FKs):
   - customers 1:N subscriptions
   - subscriptions 1:N subscription_adjustments
   - customers 1:N referrals (referrer), customers 1:N referrals (referred)

The Admin UI’s new “Klanten” tab expects these tables to be tracked and accessible to the `admin` role.

