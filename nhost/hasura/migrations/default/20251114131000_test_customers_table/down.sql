-- Rollback for: test_customers_table

-- Drop trigger
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers_new;

-- Drop indexes
DROP INDEX IF EXISTS idx_customers_created_at;
DROP INDEX IF EXISTS idx_customers_newsletter;
DROP INDEX IF EXISTS idx_customers_active;
DROP INDEX IF EXISTS idx_customers_email;

-- Drop table
DROP TABLE IF EXISTS customers_new;