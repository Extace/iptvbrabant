# Hasura / Nhost Integration Workflow

This document describes how to directly change the database & metadata for the Nhost / Hasura backend from the repository and keep everything versioned.

## 1. Install CLIs

You need both CLIs locally:

```powershell
npm install -g hasura-cli
npm install -g nhost
```

Verify:

```powershell
hasura version
nhost --version
```

## 2. Configure Environment Variables

Never hard‑code the admin secret. Use an `.env.local` (not committed) file or your shell profile.

Required variables:

```
HASURA_GRAPHQL_ADMIN_SECRET=YOUR_ADMIN_SECRET
HASURA_GRAPHQL_ENDPOINT=https://<subdomain>.graphql.<region>.nhost.run/v1
HASURA_CONSOLE_URL=https://<subdomain>.dashboard.nhost.run/services/hasura
```

For convenience you can export in PowerShell session:

```powershell
$Env:HASURA_GRAPHQL_ADMIN_SECRET="xxxx"
$Env:HASURA_GRAPHQL_ENDPOINT="https://yvkysucfvqxfaqbyeggp.graphql.eu-west-2.nhost.run/v1"
```

## 3. Hasura CLI Config

`nhost/config.yaml` already references `adminSecret: ${HASURA_GRAPHQL_ADMIN_SECRET}`. Create a Hasura CLI project file if needed:

```powershell
hasura init hasura --endpoint $Env:HASURA_GRAPHQL_ENDPOINT --admin-secret $Env:HASURA_GRAPHQL_ADMIN_SECRET
```

If the folder already exists (you have `hasura/metadata` and `hasura/migrations`), just create a `hasura/config.yaml` pointing to the endpoint if missing.

## 4. Common Commands

Pull current metadata & migrations (safe sync):

```powershell
hasura metadata export
hasura migrate create add_products_table --from-server --database-name default
```

Apply new migrations & metadata to remote:

```powershell
hasura migrate apply --all-databases --endpoint $Env:HASURA_GRAPHQL_ENDPOINT --admin-secret $Env:HASURA_GRAPHQL_ADMIN_SECRET
hasura metadata apply --endpoint $Env:HASURA_GRAPHQL_ENDPOINT --admin-secret $Env:HASURA_GRAPHQL_ADMIN_SECRET
```

Open local console (proxy) that writes migrations as you click in the UI:

```powershell
hasura console --endpoint $Env:HASURA_GRAPHQL_ENDPOINT --admin-secret $Env:HASURA_GRAPHQL_ADMIN_SECRET --save
```

The `--save` flag ensures changes become files under `hasura/metadata` and schema diffs become migrations.

## 5. Workflow for Schema Changes

1. Start console (`hasura console --save`).
2. Make changes (create tables/relationships/permissions).
3. Close console – verify new migration folders were created under `hasura/migrations`.
4. Run `hasura migrate apply` against a staging environment if you have one.
5. Commit and push the migration folder + metadata.
6. Production deploy: GitHub Action runs `hasura migrate apply` + `hasura metadata apply` using secrets.

## 6. GitHub Actions (Example)

Create `.github/workflows/hasura-deploy.yml`:

```yaml
name: Deploy Hasura
on:
  push:
    paths:
      - 'hasura/**'
    branches: [ main ]
jobs:
  apply:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Hasura CLI
        run: curl -L https://github.com/hasura/graphql-engine/raw/stable/cli/get.sh | bash
      - name: Apply migrations
        env:
          HASURA_GRAPHQL_ADMIN_SECRET: ${{ secrets.HASURA_ADMIN_SECRET }}
          HASURA_GRAPHQL_ENDPOINT: ${{ secrets.HASURA_GRAPHQL_ENDPOINT }}
        run: |
          hasura migrate apply --endpoint $HASURA_GRAPHQL_ENDPOINT --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET --all-databases
          hasura metadata apply --endpoint $HASURA_GRAPHQL_ENDPOINT --admin-secret $HASURA_GRAPHQL_ADMIN_SECRET
```

Add repository secrets:

- `HASURA_ADMIN_SECRET`
- `HASURA_GRAPHQL_ENDPOINT`

## 7. Product Catalog Migration Example

Create migration:

```powershell
hasura migrate create create_products --database-name default
```

Edit the generated `up.sql`:

```sql
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_no text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- seed initial rows
INSERT INTO public.products (product_no,name) VALUES
 ('P001','1 Jaar IPTV (Verplicht)'),
 ('P002','Android TV Box Standaard'),
 ('P003','Android TV Box Premium'),
 ('P004','Extra Afstandsbediening'),
 ('P005','Installatie aan huis'),
 ('P006','Antenne / Signaalversterker'),
 ('P007','Maand IPTV'),
 ('P008','6 Maanden IPTV');
```

Add trigger for updated_at (optional):

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
```

`down.sql` should drop trigger + table.

## 8. Orders → Order Products Join Table

Migration example `create_order_products`:

```sql
CREATE TABLE public.order_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_price_cents integer,
  name_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_products_order ON public.order_products(order_id);
```

Later you can backfill from the existing `orders.producten` text by parsing lines and matching names → product_no.

## 9. Frontend Transition Strategy

1. Add GraphQL query expansion: `orders { id ... order_products { quantity product { product_no name } } }`.
2. If `order_products` exists and returns rows, ignore legacy `producten` text except for display fallback.
3. On save: build mutation inserting/updating `order_products` rows; optionally also update `orders.producten` with serialized text for compatibility.
4. After full migration, mark `orders.producten` deprecated (keep read-only or drop after audit).

## 10. Permissions

Use Hasura console to set role-based row insert/update perms for `order_products` similar to `orders`.

## 11. Safety Checklist

- Never commit secrets.
- Run migrations locally against a copy before production.
- Keep `hasura/metadata` in sync – run `hasura metadata diff` if unsure.
- Tag releases after applying significant schema changes.

---
This gives you a fully reproducible workflow to "directly change stuff" via versioned migrations + metadata instead of ad-hoc manual edits.
