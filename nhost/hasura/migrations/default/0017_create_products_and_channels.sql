-- Voorbeeld: Uitgebreide products tabel
-- Deze migratie toont hoe je complexe tabellen kunt maken voor je IPTV platform

-- Maak products tabel
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('package', 'addon', 'device')),
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    is_active BOOLEAN DEFAULT true,
    features JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maak package_channels tabel (voor IPTV packages)
CREATE TABLE IF NOT EXISTS public.package_channels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    channel_name VARCHAR(255) NOT NULL,
    channel_category VARCHAR(100),
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes voor performance
CREATE INDEX IF NOT EXISTS idx_products_type ON public.products(type);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_price ON public.products(price);
CREATE INDEX IF NOT EXISTS idx_package_channels_product ON public.package_channels(product_id);

-- Updated_at trigger voor products
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_products
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Insert voorbeeld data
INSERT INTO public.products (name, description, type, price, features) VALUES
('Basis Pakket', 'Basis IPTV pakket met Nederlandse zenders', 'package', 29.99, '{"channels": 50, "hd_channels": 30, "4k_channels": 0}'),
('Premium Pakket', 'Premium IPTV pakket met internationale zenders', 'package', 49.99, '{"channels": 150, "hd_channels": 100, "4k_channels": 20}'),
('Sport Addon', 'Extra sportkanalen addon', 'addon', 9.99, '{"sports_channels": 15, "premium_sports": 8}'),
('Android TV Box', 'Gecertificeerde Android TV Box', 'device', 89.99, '{"android_version": "11", "ram": "4GB", "storage": "32GB"}');

-- Insert voorbeeld kanalen
INSERT INTO public.package_channels (product_id, channel_name, channel_category, is_premium) 
SELECT 
    p.id,
    channel.name,
    channel.category,
    channel.premium
FROM public.products p,
    (VALUES 
        ('NPO 1', 'Algemeen', false),
        ('NPO 2', 'Algemeen', false),
        ('RTL 4', 'Commercieel', false),
        ('SBS 6', 'Commercieel', false),
        ('ESPN', 'Sport', true),
        ('Fox Sports', 'Sport', true)
    ) AS channel(name, category, premium)
WHERE p.type = 'package';