-- Ledger of subscription changes (add/remove days, referral bonuses, corrections)
CREATE TABLE IF NOT EXISTS public.subscription_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  delta_days int NOT NULL, -- positive or negative
  reason text NOT NULL, -- manual_add/manual_reduce/referral_bonus/correction
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_adjustments_subscription_idx ON public.subscription_adjustments(subscription_id, effective_at DESC);
