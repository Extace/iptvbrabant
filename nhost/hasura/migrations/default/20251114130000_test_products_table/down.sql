-- Rollback for: test_products_table
-- This will completely remove the products table and related objects

-- Drop the trigger first
DROP TRIGGER IF EXISTS update_products_updated_at ON products;

-- Drop the function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop indexes (they'll be dropped with the table anyway, but explicit is better)
DROP INDEX IF EXISTS idx_products_created_at;
DROP INDEX IF EXISTS idx_products_sku;
DROP INDEX IF EXISTS idx_products_featured;
DROP INDEX IF EXISTS idx_products_active;
DROP INDEX IF EXISTS idx_products_category;

-- Drop the table
DROP TABLE IF EXISTS products;