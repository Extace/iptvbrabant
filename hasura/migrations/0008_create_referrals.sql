-- Records referral relationships and bonus crediting state
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  referred_customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  credited boolean NOT NULL DEFAULT false,
  credited_at timestamptz NULL,
  bonus_days int NOT NULL DEFAULT 90,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referrals_pair_unique ON public.referrals(referrer_customer_id, referred_customer_id);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_customer_id, credited, created_at DESC);
