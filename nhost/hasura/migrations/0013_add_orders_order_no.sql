BEGIN;

-- 1) Create sequence for human-friendly order numbers starting at 1
CREATE SEQUENCE IF NOT EXISTS public.orders_order_no_seq
  INCREMENT 1
  MINVALUE 1
  START 1
  OWNED BY public.orders.order_no;

-- 2) Add column on orders; unique and default to next sequence value
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_no integer;

-- Ensure default uses the sequence
ALTER TABLE public.orders
  ALTER COLUMN order_no SET DEFAULT nextval('public.orders_order_no_seq');

-- Unique index to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_no_unique ON public.orders(order_no);

-- 3) Backfill existing orders in chronological order (if any)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE order_no IS NULL ORDER BY created_at ASC, id ASC LOOP
    UPDATE public.orders
      SET order_no = nextval('public.orders_order_no_seq')
      WHERE id = r.id;
  END LOOP;
END$$;

-- 4) Align sequence to current max so next insert gets next number
SELECT setval('public.orders_order_no_seq', COALESCE((SELECT MAX(order_no) FROM public.orders), 0), true);

COMMIT;
