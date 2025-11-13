BEGIN;

-- Add updated_at column if missing and backfill
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Backfill existing rows once
UPDATE public.orders SET updated_at = COALESCE(updated_at, created_at);

COMMIT;
