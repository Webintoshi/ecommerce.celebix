-- =====================================================
-- PRODUCT CUSTOMIZATION SYSTEM - DATABASE SCHEMA
-- Celebix E-commerce Platform
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. BLUEPRINT TABLES (Admin Configuration)
-- =====================================================

-- Product Customization Schemas (Blueprint)
-- Her ürün için bir kişiselleştirme şeması
CREATE TABLE product_customization_schemas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL, -- "Telefon Kılıfı Kişiselleştirme"
    description TEXT,
    slug VARCHAR(255) UNIQUE NOT NULL, -- URL-friendly identifier
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    
    -- Settings
    settings JSONB DEFAULT '{
        "show_summary": true,
        "show_price_breakdown": true,
        "allow_multiple": false,
        "max_selections": null
    }'::jsonb
);

-- Schema-Product Assignments (Many-to-Many)
CREATE TABLE product_schema_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false, -- Bu ürün için varsayılan şema mı?
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(schema_id, product_id)
);

-- Category-Schema Assignments (Otomatik uygulama için)
CREATE TABLE category_schema_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    is_auto_apply BOOLEAN DEFAULT false, -- Yeni ürünlere otomatik uygula
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(schema_id, category_id)
);

-- =====================================================
-- 2. CUSTOMIZATION STEPS (Form Fields)
-- =====================================================

CREATE TYPE customization_step_type AS ENUM (
    'select',           -- Dropdown
    'radio_group',      -- Button group (Hayır/Lazer/Harf)
    'image_select',     -- Görsel kartlar (Paket)
    'text',             -- Tek satır yazı
    'textarea',         -- Çok satır yazı
    'checkbox',         -- Tekli onay kutusu
    'multi_select',     -- Çoklu seçim
    'file_upload',      -- Dosya yükleme
    'number',           -- Sayısal değer
    'date',             -- Tarih seçici
    'color_picker'      -- Renk seçici
);

CREATE TABLE product_customization_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id) ON DELETE CASCADE,
    
    -- Basic Info
    type customization_step_type NOT NULL,
    key VARCHAR(100) NOT NULL, -- "telefon_modeli", "font_secimi"
    label VARCHAR(255) NOT NULL, -- "Telefon Modeli"
    placeholder VARCHAR(255),
    help_text TEXT,
    
    -- Validation
    is_required BOOLEAN DEFAULT false,
    validation_rules JSONB DEFAULT '{}'::jsonb,
    -- validation_rules örnek:
    -- {
    --   "min_length": 5,
    --   "max_length": 25,
    --   "pattern": "^[a-zA-Z0-9]+$",
    --   "min_value": 0,
    --   "max_value": 100,
    --   "allowed_file_types": ["image/jpeg", "image/png"],
    --   "max_file_size": 5242880
    -- }
    
    -- Layout
    sort_order INTEGER DEFAULT 0,
    grid_width VARCHAR(20) DEFAULT 'full', -- 'full', 'half', 'third'
    
    -- Styling
    style_config JSONB DEFAULT '{}'::jsonb,
    -- {
    --   "label_position": "top",
    --   "show_label": true,
    --   "css_class": "custom-class"
    -- }
    
    -- Conditional Logic
    show_conditions JSONB DEFAULT NULL,
    -- {
    --   "operator": "and",
    --   "conditions": [
    --     { "step_key": "kisisellestirme_tipi", "operator": "equals", "value": "lazer_kazima" }
    --   ]
    -- }
    
    -- Price Configuration
    price_config JSONB DEFAULT NULL,
    -- {
    --   "base_price_adjustment": 0,
    --   "price_per_character": 5,
    --   "options": [
    --     { "value": "lazer_kazima", "price_adjustment": 50, "type": "fixed" },
    --     { "value": "harf_baski", "price_adjustment": 30, "type": "fixed" }
    --   ]
    -- }
    
    -- Default Value
    default_value TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(schema_id, key)
);

-- =====================================================
-- 3. STEP OPTIONS (For select, radio, image_select types)
-- =====================================================

CREATE TABLE product_customization_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id UUID NOT NULL REFERENCES product_customization_steps(id) ON DELETE CASCADE,
    
    -- Option Info
    label VARCHAR(255) NOT NULL, -- "iPhone 15 Pro"
    value VARCHAR(255) NOT NULL, -- "iphone_15_pro"
    description TEXT,
    
    -- Visual
    image_url TEXT,
    icon VARCHAR(100),
    color VARCHAR(50),
    
    -- Pricing
    price_adjustment DECIMAL(10, 2) DEFAULT 0,
    price_adjustment_type VARCHAR(20) DEFAULT 'fixed', -- 'fixed', 'percentage', 'multiplier'
    
    -- Stock (optional - if this option affects inventory)
    stock_quantity INTEGER,
    track_stock BOOLEAN DEFAULT false,
    
    -- Conditional Logic (option-level conditions)
    show_conditions JSONB DEFAULT NULL,
    
    -- Layout
    sort_order INTEGER DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    is_disabled BOOLEAN DEFAULT false,
    
    -- Dependent Steps (cascading options)
    dependent_step_ids UUID[] DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 4. RUNTIME TABLES (Customer Selections)
-- =====================================================

-- Cart Item Customizations
CREATE TABLE cart_item_customizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_item_id UUID NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
    schema_id UUID NOT NULL REFERENCES product_customization_schemas(id),
    
    -- Snapshot of schema at the time of adding to cart
    -- (Admin değişiklik yaparsa cart bozulmaz)
    schema_snapshot JSONB NOT NULL,
    
    -- Customer selections
    selections JSONB NOT NULL,
    -- selections format:
    -- [
    --   {
    --     "step_id": "uuid",
    --     "step_key": "telefon_modeli",
    --     "step_label": "Telefon Modeli",
    --     "type": "select",
    --     "value": "iphone_15_pro",
    --     "display_value": "iPhone 15 Pro",
    --     "price_adjustment": 0
    --   },
    --   {
    --     "step_id": "uuid",
    --     "step_key": "yazi_ekle",
    --     "step_label": "Yazı Ekle",
    --     "type": "text",
    --     "value": "Ahmet",
    --     "display_value": "Ahmet",
    --     "price_adjustment": 25
    --   }
    -- ]
    
    -- Calculated price breakdown
    price_breakdown JSONB NOT NULL,
    -- {
    --   "base_price": 299.99,
    --   "adjustments": [...],
    --   "total_adjustment": 75.00,
    --   "final_price": 374.99
    -- }
    
    -- Custom text content (for engraving, etc.)
    custom_text_content TEXT,
    
    -- Uploaded files (if any)
    uploaded_files JSONB DEFAULT '[]'::jsonb,
    -- [{ "file_url": "...", "file_name": "...", "file_type": "..." }]
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(cart_item_id, schema_id)
);

-- Order Item Customizations (Persisted after checkout)
CREATE TABLE order_item_customizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    schema_id UUID REFERENCES product_customization_schemas(id),
    
    -- Snapshot of schema at the time of order
    schema_snapshot JSONB NOT NULL,
    schema_version INTEGER DEFAULT 1,
    
    -- Customer selections (immutable after order)
    selections JSONB NOT NULL,
    
    -- Price breakdown at the time of order
    price_breakdown JSONB NOT NULL,
    
    -- Custom content
    custom_text_content TEXT,
    uploaded_files JSONB DEFAULT '[]'::jsonb,
    
    -- Production notes (for fulfillment team)
    production_notes TEXT,
    production_status VARCHAR(50) DEFAULT 'pending',
    -- 'pending', 'in_progress', 'completed', 'cancelled'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(order_item_id)
);

-- =====================================================
-- 5. INDEXES FOR PERFORMANCE
-- =====================================================

-- Schema lookups
CREATE INDEX idx_schemas_slug ON product_customization_schemas(slug);
CREATE INDEX idx_schemas_active ON product_customization_schemas(is_active);

-- Product assignments
CREATE INDEX idx_product_assignments_product ON product_schema_assignments(product_id);
CREATE INDEX idx_product_assignments_schema ON product_schema_assignments(schema_id);
CREATE INDEX idx_product_assignments_default ON product_schema_assignments(product_id, is_default);

-- Category assignments
CREATE INDEX idx_category_assignments_category ON category_schema_assignments(category_id);

-- Step lookups
CREATE INDEX idx_steps_schema ON product_customization_steps(schema_id);
CREATE INDEX idx_steps_key ON product_customization_steps(schema_id, key);
CREATE INDEX idx_steps_sort ON product_customization_steps(schema_id, sort_order);

-- Option lookups
CREATE INDEX idx_options_step ON product_customization_options(step_id);
CREATE INDEX idx_options_sort ON product_customization_options(step_id, sort_order);

-- Cart lookups
CREATE INDEX idx_cart_customizations_item ON cart_item_customizations(cart_item_id);
CREATE INDEX idx_cart_customizations_schema ON cart_item_customizations(schema_id);

-- Order lookups
CREATE INDEX idx_order_customizations_item ON order_item_customizations(order_item_id);
CREATE INDEX idx_order_customizations_status ON order_item_customizations(production_status);

-- GIN indexes for JSONB queries
CREATE INDEX idx_steps_conditions ON product_customization_steps USING GIN(show_conditions);
CREATE INDEX idx_cart_selections ON cart_item_customizations USING GIN(selections);
CREATE INDEX idx_order_selections ON order_item_customizations USING GIN(selections);

-- =====================================================
-- 6. TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_schemas_updated_at 
    BEFORE UPDATE ON product_customization_schemas 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_steps_updated_at 
    BEFORE UPDATE ON product_customization_steps 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_options_updated_at 
    BEFORE UPDATE ON product_customization_options 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cart_customizations_updated_at 
    BEFORE UPDATE ON cart_item_customizations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE product_customization_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_schema_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_schema_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_customization_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_customization_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_item_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_customizations ENABLE ROW LEVEL SECURITY;

-- Schemas: Everyone can read active schemas
CREATE POLICY schemas_select_all ON product_customization_schemas
    FOR SELECT USING (is_active = true);

-- Schemas: Only admins can modify
CREATE POLICY schemas_modify_admin ON product_customization_schemas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'product_manager', 'order_manager', 'content_creator')
        )
    );

-- Steps: Everyone can read
CREATE POLICY steps_select_all ON product_customization_steps
    FOR SELECT USING (true);

-- Steps: Only admins can modify
CREATE POLICY steps_modify_admin ON product_customization_steps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'product_manager', 'order_manager', 'content_creator')
        )
    );

-- Options: Everyone can read
CREATE POLICY options_select_all ON product_customization_options
    FOR SELECT USING (true);

-- Options: Only admins can modify
CREATE POLICY options_modify_admin ON product_customization_options
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'product_manager', 'order_manager', 'content_creator')
        )
    );

-- Cart Customizations: Users can only access their own cart
CREATE POLICY cart_customizations_user ON cart_item_customizations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM cart_items ci
            JOIN carts c ON ci.cart_id = c.id
            WHERE ci.id = cart_item_customizations.cart_item_id
            AND (c.user_id = auth.uid() OR c.session_id = current_setting('app.current_session_id', true))
        )
    );

-- Order Customizations: Users can read their own orders
CREATE POLICY order_customizations_user ON order_item_customizations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN customers c ON c.id = o.customer_id
            WHERE oi.id = order_item_customizations.order_item_id
            AND c.user_id = auth.uid()
        )
    );

-- Order Customizations: Admins can read all
CREATE POLICY order_customizations_admin ON order_item_customizations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('super_admin', 'product_manager', 'order_manager', 'content_creator')
        )
    );

-- =====================================================
-- 8. HELPER FUNCTIONS
-- =====================================================

-- Get schema with all steps and options (for frontend)
CREATE OR REPLACE FUNCTION get_schema_with_details(schema_slug TEXT)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'slug', s.slug,
        'settings', s.settings,
        'steps', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', st.id,
                    'type', st.type,
                    'key', st.key,
                    'label', st.label,
                    'placeholder', st.placeholder,
                    'help_text', st.help_text,
                    'is_required', st.is_required,
                    'validation_rules', st.validation_rules,
                    'grid_width', st.grid_width,
                    'style_config', st.style_config,
                    'show_conditions', st.show_conditions,
                    'price_config', st.price_config,
                    'default_value', st.default_value,
                    'sort_order', st.sort_order,
                    'options', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', o.id,
                                'label', o.label,
                                'value', o.value,
                                'description', o.description,
                                'image_url', o.image_url,
                                'icon', o.icon,
                                'color', o.color,
                                'price_adjustment', o.price_adjustment,
                                'price_adjustment_type', o.price_adjustment_type,
                                'stock_quantity', o.stock_quantity,
                                'track_stock', o.track_stock,
                                'show_conditions', o.show_conditions,
                                'sort_order', o.sort_order,
                                'is_default', o.is_default,
                                'is_disabled', o.is_disabled
                            ) ORDER BY o.sort_order
                        )
                        FROM product_customization_options o
                        WHERE o.step_id = st.id
                    )
                ) ORDER BY st.sort_order
            )
            FROM product_customization_steps st
            WHERE st.schema_id = s.id
        )
    ) INTO result
    FROM product_customization_schemas s
    WHERE s.slug = schema_slug AND s.is_active = true;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate customization price
CREATE OR REPLACE FUNCTION calculate_customization_price(
    p_schema_id UUID,
    p_selections JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_base_price DECIMAL(10, 2) := 0;
    v_total_adjustment DECIMAL(10, 2) := 0;
    v_adjustments JSONB := '[]'::jsonb;
    v_selection JSONB;
    v_step RECORD;
    v_option RECORD;
    v_price_adjustment DECIMAL(10, 2);
BEGIN
    -- Iterate through selections
    FOR v_selection IN SELECT * FROM jsonb_array_elements(p_selections)
    LOOP
        -- Get step details
        SELECT * INTO v_step
        FROM product_customization_steps
        WHERE id = (v_selection->>'step_id')::UUID;
        
        IF v_step.type IN ('select', 'radio_group', 'image_select') THEN
            -- Get option price adjustment
            SELECT * INTO v_option
            FROM product_customization_options
            WHERE step_id = v_step.id AND value = v_selection->>'value';
            
            IF FOUND THEN
                v_price_adjustment := v_option.price_adjustment;
                
                -- Apply percentage or multiplier
                IF v_option.price_adjustment_type = 'percentage' THEN
                    v_price_adjustment := (v_base_price * v_option.price_adjustment / 100);
                ELSIF v_option.price_adjustment_type = 'multiplier' THEN
                    v_price_adjustment := (v_base_price * (v_option.price_adjustment - 1));
                END IF;
                
                v_total_adjustment := v_total_adjustment + v_price_adjustment;
                
                v_adjustments := v_adjustments || jsonb_build_object(
                    'step_key', v_step.key,
                    'step_label', v_step.label,
                    'option_value', v_option.value,
                    'option_label', v_option.label,
                    'adjustment_type', v_option.price_adjustment_type,
                    'adjustment_amount', v_price_adjustment
                );
            END IF;
        ELSIF v_step.price_config IS NOT NULL THEN
            -- Handle text/textarea price per character
            IF (v_step.price_config->>'price_per_character')::DECIMAL IS NOT NULL THEN
                v_price_adjustment := LENGTH(v_selection->>'value') * (v_step.price_config->>'price_per_character')::DECIMAL;
                v_total_adjustment := v_total_adjustment + v_price_adjustment;
                
                v_adjustments := v_adjustments || jsonb_build_object(
                    'step_key', v_step.key,
                    'step_label', v_step.label,
                    'adjustment_type', 'per_character',
                    'character_count', LENGTH(v_selection->>'value'),
                    'adjustment_amount', v_price_adjustment
                );
            END IF;
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'base_price', v_base_price,
        'adjustments', v_adjustments,
        'total_adjustment', v_total_adjustment,
        'final_price', v_base_price + v_total_adjustment
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 9. SEED DATA (Optional Examples)
-- =====================================================

-- Example: Phone Case Customization Schema
-- INSERT INTO product_customization_schemas (id, name, slug, description) VALUES
-- ('550e8400-e29b-41d4-a716-446655440000', 'Telefon Kılıfı Kişiselleştirme', 'telefon-kilifi', 'iPhone kılıfları için kişiselleştirme seçenekleri');

-- INSERT INTO product_customization_steps (id, schema_id, type, key, label, sort_order, is_required) VALUES
-- ('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'select', 'telefon_modeli', 'Telefon Modeli', 1, true),
-- ('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'radio_group', 'kisisellestirme_tipi', 'Kişiselleştirme İstiyor Musunuz?', 2, true),
-- ('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 'select', 'font', 'Font', 3, true, 
--     '{"show_conditions": {"operator": "and", "conditions": [{"step_key": "kisisellestirme_tipi", "operator": "equals", "value": "lazer_kazima"}]}}'::jsonb),
-- ('550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', 'text', 'yazi_ekle', 'Yazı Ekle', 4, true,
--     '{"max_length": 25}'::jsonb, '{"show_conditions": {"operator": "or", "conditions": [{"step_key": "kisisellestirme_tipi", "operator": "equals", "value": "lazer_kazima"}, {"step_key": "kisisellestirme_tipi", "operator": "equals", "value": "harf_baski"}]}}'::jsonb),
-- ('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440000', 'image_select', 'paket_secimi', 'Paketinizi Seçiniz', 5, true);
