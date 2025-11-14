-- Migration: test_customers_table  
-- Created: 2025-11-14 13:10:00
-- Purpose: Add customers table to complement products

CREATE TABLE IF NOT EXISTS customers_new (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100), 
    phone VARCHAR(20),
    address JSONB,
    newsletter_subscribed BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers_new(email);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers_new(active);
CREATE INDEX IF NOT EXISTS idx_customers_newsletter ON customers_new(newsletter_subscribed) WHERE newsletter_subscribed = true;
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers_new(created_at DESC);

-- Add updated_at trigger
CREATE TRIGGER update_customers_updated_at 
    BEFORE UPDATE ON customers_new 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();