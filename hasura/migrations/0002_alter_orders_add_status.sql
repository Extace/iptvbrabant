-- Add operational columns for dashboard workflows
-- status: simple lifecycle marker; updated_at: last modification time

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nieuw',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Helpful indexes for list views
CREATE INDEX IF NOT EXISTS orders_created_at_desc_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);

-- Optional: ensure totaal is always text (already text), leave as-is for now.
