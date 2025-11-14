-- Rollback for: add_products_table

-- Drop indexes first
DROP INDEX IF EXISTS idx_products_created_at;
DROP INDEX IF EXISTS idx_products_active;
DROP INDEX IF EXISTS idx_products_category;

-- Drop table
DROP TABLE IF EXISTS products;