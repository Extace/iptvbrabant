BEGIN;

-- 1) Add customer_id FK on orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE public.orders
  ADD CONSTRAINT IF NOT EXISTS orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);

-- 2) Helper to normalize phone numbers
CREATE OR REPLACE FUNCTION public._norm_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(lower(coalesce(p,'')), '[^0-9+]', '', 'g'),'');
$$;

-- 3) BEFORE INSERT trigger to upsert/link customer
CREATE OR REPLACE FUNCTION public.orders_before_insert_set_customer()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  existing_id uuid;
BEGIN
  -- prefer email match
  IF NEW.email IS NOT NULL AND length(trim(NEW.email)) > 0 THEN
    SELECT id INTO existing_id FROM public.customers WHERE lower(email) = lower(NEW.email) LIMIT 1;
  END IF;
  -- fallback to phone match
  IF existing_id IS NULL AND NEW.telefoon IS NOT NULL AND length(trim(NEW.telefoon)) > 0 THEN
    SELECT id INTO existing_id FROM public.customers WHERE public._norm_phone(telefoon) = public._norm_phone(NEW.telefoon) LIMIT 1;
  END IF;

  IF existing_id IS NULL THEN
    INSERT INTO public.customers(naam, email, telefoon, adres, notes)
    VALUES (NULLIF(NEW.naam,''), NULLIF(NEW.email,''), NULLIF(NEW.telefoon,''), NULLIF(NEW.adres,''), 'auto-created from order')
    RETURNING id INTO existing_id;
  END IF;

  NEW.customer_id := existing_id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_orders_before_insert_customer ON public.orders;
CREATE TRIGGER trg_orders_before_insert_customer
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_before_insert_set_customer();

-- 4) Backfill existing orders without customer_id
DO $$
DECLARE r record; cid uuid;
BEGIN
  FOR r IN SELECT id,email,telefoon,naam,adres FROM public.orders WHERE customer_id IS NULL LOOP
    cid := NULL;
    IF r.email IS NOT NULL AND length(trim(r.email)) > 0 THEN
      SELECT id INTO cid FROM public.customers WHERE lower(email) = lower(r.email) LIMIT 1;
    END IF;
    IF cid IS NULL AND r.telefoon IS NOT NULL AND length(trim(r.telefoon)) > 0 THEN
      SELECT id INTO cid FROM public.customers WHERE public._norm_phone(telefoon) = public._norm_phone(r.telefoon) LIMIT 1;
    END IF;
    IF cid IS NULL THEN
      INSERT INTO public.customers(naam,email,telefoon,adres,notes)
      VALUES (NULLIF(r.naam,''), NULLIF(r.email,''), NULLIF(r.telefoon,''), NULLIF(r.adres,''), 'backfill from order')
      RETURNING id INTO cid;
    END IF;
    UPDATE public.orders SET customer_id = cid WHERE id = r.id;
  END LOOP;
END$$;

COMMIT;
