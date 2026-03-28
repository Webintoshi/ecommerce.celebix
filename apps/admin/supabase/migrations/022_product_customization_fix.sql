-- =====================================================
-- PRODUCT CUSTOMIZATION SYSTEM - DATABASE SCHEMA (Fixed)
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ENUM TYPES
DO $$ BEGIN
    CREATE TYPE customization_step_type AS ENUM (
        'select', 'radio_group', 'image_select', 'text', 'textarea', 
        'checkbox', 'multi_select', 'file_upload', 'number', 'date', 'color_picker'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE price_adjustment_type AS ENUM ('fixed', 'percentage', 'per_character');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. BLUEPRINT TABLES
CREATE TABLE IF NOT EXISTS product_customization_schemas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    slug VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    settings JSONB DEFAULT '{"show_summary": true, "show_price_breakdown": true, "allow_multiple": false}'::jsonb
);

CREATE TABLE IF NOT EXISTS product_schema_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(schema_id, product_id)
);

CREATE TABLE IF NOT EXISTS category_schema_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    is_auto_apply BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(schema_id, category_id)
);

-- 3. CUSTOMIZATION STEPS & OPTIONS
CREATE TABLE IF NOT EXISTS product_customization_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id) ON DELETE CASCADE,
    type customization_step_type NOT NULL,
    key VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    placeholder VARCHAR(255),
    help_text TEXT,
    is_required BOOLEAN DEFAULT false,
    validation_rules JSONB DEFAULT '{}'::jsonb,
    conditional_logic JSONB DEFAULT '{}'::jsonb,
    sort_order INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_customization_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id UUID NOT NULL REFERENCES product_customization_steps(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    value VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_step_conditions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id UUID NOT NULL REFERENCES product_customization_steps(id) ON DELETE CASCADE,
    depends_on_step_id UUID NOT NULL REFERENCES product_customization_steps(id) ON DELETE CASCADE,
    operator VARCHAR(50) NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. RUNTIME TABLES
CREATE TABLE IF NOT EXISTS cart_item_customizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_item_id UUID NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id),
    step_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_price DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_item_customizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    schema_snapshot_id UUID NOT NULL,
    step_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_price DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_adjustment_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id UUID REFERENCES product_customization_steps(id) ON DELETE CASCADE,
    option_id UUID REFERENCES product_customization_options(id) ON DELETE CASCADE,
    adjustment_type price_adjustment_type NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    conditions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_customization_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id),
    version INTEGER NOT NULL,
    snapshot_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(schema_id, version)
);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_customization_schemas_slug ON product_customization_schemas(slug);
CREATE INDEX IF NOT EXISTS idx_customization_schemas_active ON product_customization_schemas(is_active);
CREATE INDEX IF NOT EXISTS idx_schema_assignments_product ON product_schema_assignments(product_id);
CREATE INDEX IF NOT EXISTS idx_customization_steps_schema ON product_customization_steps(schema_id);
CREATE INDEX IF NOT EXISTS idx_customization_options_step ON product_customization_options(step_id);
CREATE INDEX IF NOT EXISTS idx_cart_customizations_cart_item ON cart_item_customizations(cart_item_id);
CREATE INDEX IF NOT EXISTS idx_order_customizations_order_item ON order_item_customizations(order_item_id);

-- GIN indexes for JSONB
CREATE INDEX IF NOT EXISTS idx_customization_steps_logic ON product_customization_steps USING GIN(conditional_logic);
CREATE INDEX IF NOT EXISTS idx_cart_customizations_values ON cart_item_customizations USING GIN(step_values);

-- 6. RLS POLICIES (Simplified - no admin_users reference)
ALTER TABLE product_customization_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_schema_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_schema_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_customization_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_customization_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_step_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_item_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_adjustment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_customization_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (restrict in application layer)
CREATE POLICY read_schemas ON product_customization_schemas FOR SELECT USING (true);
CREATE POLICY read_schema_assignments ON product_schema_assignments FOR SELECT USING (true);
CREATE POLICY read_category_assignments ON category_schema_assignments FOR SELECT USING (true);
CREATE POLICY read_steps ON product_customization_steps FOR SELECT USING (true);
CREATE POLICY read_options ON product_customization_options FOR SELECT USING (true);
CREATE POLICY read_conditions ON product_step_conditions FOR SELECT USING (true);
CREATE POLICY read_price_rules ON price_adjustment_rules FOR SELECT USING (true);
CREATE POLICY read_snapshots ON product_customization_snapshots FOR SELECT USING (true);

-- Cart customizations - user owns
CREATE POLICY cart_customizations_user ON cart_item_customizations FOR ALL USING (
    EXISTS (
        SELECT 1 FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.id
        WHERE ci.id = cart_item_customizations.cart_item_id
        AND (c.user_id = auth.uid() OR c.session_id = current_setting('app.current_session_id', true))
    )
);

-- Order customizations - user owns
CREATE POLICY order_customizations_user ON order_item_customizations FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.id = order_item_customizations.order_item_id
        AND (o.user_id = auth.uid() OR o.guest_email = current_setting('app.current_email', true))
    )
);

-- 7. HELPER FUNCTION
CREATE OR REPLACE FUNCTION calculate_customization_price(
    p_schema_id UUID,
    p_step_values JSONB
) RETURNS DECIMAL AS $$
DECLARE
    v_total DECIMAL := 0;
    v_step RECORD;
    v_option RECORD;
    v_value TEXT;
    v_array_values TEXT[];
BEGIN
    FOR v_step IN SELECT * FROM product_customization_steps WHERE schema_id = p_schema_id LOOP
        IF p_step_values ? v_step.key THEN
            v_value := p_step_values->>v_step.key;
            
            IF v_step.type IN ('select', 'radio_group', 'image_select') THEN
                SELECT * INTO v_option FROM product_customization_options 
                WHERE step_id = v_step.id AND value = v_value LIMIT 1;
                
                IF FOUND THEN
                    SELECT COALESCE(SUM(CASE WHEN adjustment_type = 'fixed' THEN amount ELSE 0 END), 0)
                    INTO v_total
                    FROM price_adjustment_rules
                    WHERE option_id = v_option.id AND is_active = true;
                END IF;
            ELSIF v_step.type IN ('multi_select', 'checkbox') THEN
                SELECT ARRAY_AGG(elem::text) INTO v_array_values
                FROM jsonb_array_elements_text(p_step_values->v_step.key) AS elem;
                
                FOR v_option IN 
                    SELECT * FROM product_customization_options 
                    WHERE step_id = v_step.id AND value = ANY(v_array_values)
                LOOP
                    SELECT v_total + COALESCE(SUM(CASE WHEN adjustment_type = 'fixed' THEN amount ELSE 0 END), 0)
                    INTO v_total
                    FROM price_adjustment_rules
                    WHERE option_id = v_option.id AND is_active = true;
                END LOOP;
            ELSIF v_step.type = 'text' OR v_step.type = 'textarea' THEN
                SELECT v_total + COALESCE(SUM(
                    CASE 
                        WHEN adjustment_type = 'per_character' THEN amount * LENGTH(v_value)
                        WHEN adjustment_type = 'fixed' THEN amount
                        ELSE 0
                    END
                ), 0) INTO v_total
                FROM price_adjustment_rules pr
                JOIN product_customization_options po ON pr.option_id = po.id
                WHERE po.step_id = v_step.id AND pr.is_active = true;
            END IF;
        END IF;
    END LOOP;
    
    RETURN v_total;
END;
$$ LANGUAGE plpgsql;
