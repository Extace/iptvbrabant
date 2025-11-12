BEGIN;

-- 1) Add referrer_email on orders to capture referral by email from storefront
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referrer_email text;
CREATE INDEX IF NOT EXISTS idx_orders_referrer_email ON public.orders((lower(referrer_email)));

-- 2) AFTER INSERT trigger to credit referral bonus to referrer by email
CREATE OR REPLACE FUNCTION public.orders_after_insert_handle_referral()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ref_email text;
  ref_id uuid;
  sub_id uuid;
  sub_end date;
  today date := current_date;
  new_end date;
  bonus int := 90;
BEGIN
  ref_email := lower(NULLIF(NEW.referrer_email, ''));
  IF ref_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- find referrer by email
  SELECT id INTO ref_id FROM public.customers WHERE lower(email) = ref_email LIMIT 1;
  IF ref_id IS NULL OR (NEW.customer_id IS NOT NULL AND ref_id = NEW.customer_id) THEN
    RETURN NEW; -- no valid separate referrer found
  END IF;

  -- upsert referral row and mark credited
  INSERT INTO public.referrals(referrer_customer_id, referred_customer_id, credited, credited_at, bonus_days)
  VALUES (ref_id, NEW.customer_id, true, now(), bonus)
  ON CONFLICT (referrer_customer_id, referred_customer_id)
  DO UPDATE SET credited = true, credited_at = EXCLUDED.credited_at, bonus_days = EXCLUDED.bonus_days;

  -- credit subscription: extend latest or create new
  SELECT id, end_date INTO sub_id, sub_end
  FROM public.subscriptions
  WHERE customer_id = ref_id
  ORDER BY end_date DESC
  LIMIT 1;

  IF sub_id IS NULL THEN
    INSERT INTO public.subscriptions(customer_id, plan, source, start_date, end_date)
    VALUES (ref_id, 'referral', 'referral_bonus', today, today + (bonus || ' days')::interval)
    RETURNING id, end_date INTO sub_id, sub_end;
  ELSE
    new_end := GREATEST(today, sub_end) + (bonus || ' days')::interval;
    UPDATE public.subscriptions SET end_date = new_end WHERE id = sub_id;
  END IF;

  -- ledger entry
  INSERT INTO public.subscription_adjustments(subscription_id, delta_days, reason)
  VALUES (sub_id, bonus, 'referral_bonus');

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_orders_after_insert_referral ON public.orders;
CREATE TRIGGER trg_orders_after_insert_referral
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_after_insert_handle_referral();

COMMIT;
