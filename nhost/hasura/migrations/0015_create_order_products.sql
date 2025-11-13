-- Migration: create order_products join table
-- Relates orders to products with quantities and price snapshot
CREATE TABLE IF NOT EXISTS public.order_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity integer NOT NULL DEFAULT 1,
  unit_price_cents integer,
  name_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_products_order ON public.order_products(order_id);
CREATE INDEX IF NOT EXISTS idx_order_products_product ON public.order_products(product_id);