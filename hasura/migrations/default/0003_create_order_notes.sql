-- Notes attached to orders for internal staff communication
CREATE TABLE IF NOT EXISTS public.order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid, -- optional: future link to auth.users.id via Hasura if desired
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for quick lookup by order
CREATE INDEX IF NOT EXISTS order_notes_order_id_idx ON public.order_notes(order_id);
