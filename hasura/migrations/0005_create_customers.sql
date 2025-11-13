-- Customers master table
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  naam text NOT NULL,
  telefoon text,
  email text,
  adres text,
  referral_code text UNIQUE,
  referred_by uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  wants_email_reminders boolean NOT NULL DEFAULT true,
  wants_sms_reminders boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS customers_email_idx ON public.customers((lower(email))) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_phone_idx ON public.customers(telefoon);
CREATE INDEX IF NOT EXISTS customers_referred_by_idx ON public.customers(referred_by);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_customers_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_updated_at ON public.customers;
CREATE TRIGGER customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.set_customers_updated_at();
