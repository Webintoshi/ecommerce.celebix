-- =====================================================
-- CELEBIX E-COMMERCE DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =====================================================
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- =====================================================
-- PRODUCTS
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    short_description TEXT,
    images TEXT [] DEFAULT '{}',
    category TEXT,
    tags TEXT [] DEFAULT '{}',
    is_featured BOOLEAN DEFAULT false,
    is_bestseller BOOLEAN DEFAULT false,
    seo_title TEXT,
    seo_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    stock INTEGER DEFAULT 0,
    weight TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- CATEGORIES
-- =====================================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    image TEXT,
    parent_id UUID REFERENCES categories(id),
    sort_order INTEGER DEFAULT 0
);
-- =====================================================
-- CUSTOMERS
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
    total_orders INTEGER DEFAULT 0,
    total_spent DECIMAL(10, 2) DEFAULT 0,
    last_order_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Addresses
CREATE TABLE IF NOT EXISTS addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'shipping',
    first_name TEXT,
    last_name TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'TR',
    phone TEXT,
    is_default BOOLEAN DEFAULT false
);
-- =====================================================
-- ORDERS
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id),
    status TEXT DEFAULT 'pending',
    subtotal DECIMAL(10, 2) NOT NULL,
    shipping_cost DECIMAL(10, 2) DEFAULT 0,
    discount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    shipping_address JSONB,
    billing_address JSONB,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    notes TEXT,
    shipping_carrier TEXT,
    tracking_number TEXT,
    estimated_delivery DATE,
    internal_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    variant_id UUID REFERENCES product_variants(id),
    product_name TEXT NOT NULL,
    variant_name TEXT,
    price DECIMAL(10, 2) NOT NULL,
    quantity INTEGER NOT NULL,
    total DECIMAL(10, 2) NOT NULL
);
-- Order Activity Log
CREATE TABLE IF NOT EXISTS order_activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    admin_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- COUPONS
-- =====================================================
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    type TEXT DEFAULT 'percentage',
    value DECIMAL(10, 2) NOT NULL,
    min_order DECIMAL(10, 2) DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);
-- =====================================================
-- SETTINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- BLOG
-- =====================================================
CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT,
    excerpt TEXT,
    featured_image TEXT,
    author TEXT,
    status TEXT DEFAULT 'draft',
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- ABANDONED CARTS
-- =====================================================
CREATE TABLE IF NOT EXISTS abandoned_carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id),
    email TEXT,
    phone TEXT,
    items JSONB NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    recovered BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_bestseller ON products(is_bestseller);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_order_activity_log_order ON order_activity_log(order_id);
CREATE INDEX IF NOT EXISTS idx_order_activity_log_created ON order_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;
-- Public read access for products, categories, blog
CREATE POLICY "Products are viewable by everyone" ON products FOR
SELECT USING (true);
CREATE POLICY "Product variants are viewable by everyone" ON product_variants FOR
SELECT USING (true);
CREATE POLICY "Categories are viewable by everyone" ON categories FOR
SELECT USING (true);
CREATE POLICY "Published blog posts are viewable by everyone" ON blog_posts FOR
SELECT USING (status = 'published');
CREATE POLICY "Active coupons are viewable by everyone" ON coupons FOR
SELECT USING (is_active = true);
-- Service role has full access (for admin operations)
CREATE POLICY "Service role has full access to products" ON products FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to variants" ON product_variants FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to categories" ON categories FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to customers" ON customers FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to addresses" ON addresses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to orders" ON orders FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to order_items" ON order_items FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to order_activity_log" ON order_activity_log FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to coupons" ON coupons FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to settings" ON settings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to blog_posts" ON blog_posts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to abandoned_carts" ON abandoned_carts FOR ALL USING (auth.role() = 'service_role');
-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_last_order ON customers(last_order_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_products_updated_at BEFORE
UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE
UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE
UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE
UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTIONS: Customer Stats Auto-Update
-- =====================================================
-- Function to update customer stats when order is created
CREATE OR REPLACE FUNCTION update_customer_on_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_id IS NOT NULL THEN
        UPDATE customers
        SET 
            total_orders = total_orders + 1,
            total_spent = total_spent + NEW.total,
            last_order_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_customer_on_order ON orders;
CREATE TRIGGER trigger_update_customer_on_order
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_on_order();

-- Function to update customer stats when order is deleted
CREATE OR REPLACE FUNCTION update_customer_on_order_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.customer_id IS NOT NULL THEN
        UPDATE customers
        SET 
            total_orders = GREATEST(0, total_orders - 1),
            total_spent = GREATEST(0, total_spent - OLD.total),
            updated_at = NOW()
        WHERE id = OLD.customer_id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_customer_on_delete ON orders;
CREATE TRIGGER trigger_update_customer_on_delete
    BEFORE DELETE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_on_order_delete();
