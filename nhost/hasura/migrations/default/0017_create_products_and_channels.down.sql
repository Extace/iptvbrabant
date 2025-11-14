-- Down migratie voor products en channels
-- Dit draait de 0017_create_products_and_channels.sql migratie terug

-- Verwijder triggers
DROP TRIGGER IF EXISTS set_timestamp_products ON public.products;
DROP FUNCTION IF EXISTS trigger_set_timestamp();

-- Verwijder indexes
DROP INDEX IF EXISTS idx_package_channels_product;
DROP INDEX IF EXISTS idx_products_price;
DROP INDEX IF EXISTS idx_products_active;
DROP INDEX IF EXISTS idx_products_type;

-- Verwijder tabellen (in omgekeerde volgorde van dependencies)
DROP TABLE IF EXISTS public.package_channels;
DROP TABLE IF EXISTS public.products;