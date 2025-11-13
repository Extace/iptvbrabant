-- Subscriptions table to track service periods per customer
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'jaar', -- simple label for now
  source text NOT NULL DEFAULT 'manual', -- order/manual/referral_bonus
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS subscriptions_customer_end_idx ON public.subscriptions(customer_id, end_date DESC);
CREATE INDEX IF NOT EXISTS subscriptions_end_date_idx ON public.subscriptions(end_date DESC);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_subscriptions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_subscriptions_updated_at();
