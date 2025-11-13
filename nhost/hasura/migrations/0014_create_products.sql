-- Migration: create products table
-- Ensure pgcrypto extension exists for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_no text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_products_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.set_products_updated_at();

-- Seed initial catalog rows (IDs align with frontend P001..P008)
INSERT INTO public.products (product_no,name) VALUES
 ('P001','1 Jaar IPTV (Verplicht)'),
 ('P002','Android TV Box Standaard'),
 ('P003','Android TV Box Premium'),
 ('P004','Extra Afstandsbediening'),
 ('P005','Installatie aan huis'),
 ('P006','Antenne / Signaalversterker'),
 ('P007','Maand IPTV'),
 ('P008','6 Maanden IPTV')
ON CONFLICT (product_no) DO NOTHING;