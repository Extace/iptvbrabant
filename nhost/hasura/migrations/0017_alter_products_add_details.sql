-- Migration: alter products table to add detailed fields
-- Adds: product_description, product_information, cost_price_cents, sale_price_cents

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_description text,
  ADD COLUMN IF NOT EXISTS product_information text,
  ADD COLUMN IF NOT EXISTS cost_price_cents integer,
  ADD COLUMN IF NOT EXISTS sale_price_cents integer;
