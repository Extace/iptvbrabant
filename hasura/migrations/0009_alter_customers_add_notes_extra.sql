-- Add flexible fields to customers: notes and extra (jsonb) for future-proof attributes
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Helpful GIN index for JSONB queries (optional, safe to create)
CREATE INDEX IF NOT EXISTS customers_extra_gin_idx ON public.customers USING GIN (extra);
