-- Enable pgcrypto for gen_random_uuid if not already
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  klanttype text,
  naam text,
  telefoon text,
  email text,
  adres text,
  producten text,
  totaal text,
  opmerkingen text,
  created_at timestamptz DEFAULT now()
);
