-- =====================================================
-- CART SYSTEM - DATABASE SCHEMA
-- Celebix E-commerce Platform
-- =====================================================

-- Carts table (user or session based)
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT, -- For guest users
    
    -- Cart status
    status VARCHAR(50) DEFAULT 'active', -- active, converted, abandoned
    
    -- Totals (denormalized for performance)
    subtotal DECIMAL(10, 2) DEFAULT 0,
    discount_total DECIMAL(10, 2) DEFAULT 0,
    tax_total DECIMAL(10, 2) DEFAULT 0,
    shipping_total DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) DEFAULT 0,
    
    -- Currency
    currency VARCHAR(3) DEFAULT 'TRY',
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    converted_at TIMESTAMP WITH TIME ZONE, -- When converted to order
    
    -- Guest email (for abandoned cart recovery)
    guest_email VARCHAR(255),
    
    -- Shipping/Billing info (captured during checkout)
    shipping_address JSONB,
    billing_address JSONB
);

-- Cart Items
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Quantity and price
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    
    -- Variant info (if applicable)
    variant_id UUID,
    variant_sku VARCHAR(100),
    
    -- Product snapshot (at the time of adding to cart)
    product_name VARCHAR(255) NOT NULL,
    product_image TEXT,
    
    -- Metadata
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_carts_user_id ON carts(user_id);
CREATE INDEX idx_carts_session_id ON carts(session_id);
CREATE INDEX idx_carts_status ON carts(status);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
CREATE INDEX idx_cart_items_product_id ON cart_items(product_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_carts_updated_at
    BEFORE UPDATE ON carts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cart_items_updated_at
    BEFORE UPDATE ON cart_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Cart policies
CREATE POLICY cart_select_own ON carts
    FOR SELECT USING (
        user_id = auth.uid() 
        OR session_id = current_setting('app.current_session_id', true)
    );

CREATE POLICY cart_insert_own ON carts
    FOR INSERT WITH CHECK (
        user_id = auth.uid() 
        OR session_id IS NOT NULL
    );

CREATE POLICY cart_update_own ON carts
    FOR UPDATE USING (
        user_id = auth.uid() 
        OR session_id = current_setting('app.current_session_id', true)
    );

CREATE POLICY cart_delete_own ON carts
    FOR DELETE USING (
        user_id = auth.uid() 
        OR session_id = current_setting('app.current_session_id', true)
    );

-- Cart items policies
CREATE POLICY cart_items_select_own ON cart_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM carts 
            WHERE carts.id = cart_items.cart_id 
            AND (carts.user_id = auth.uid() 
                 OR carts.session_id = current_setting('app.current_session_id', true))
        )
    );

CREATE POLICY cart_items_insert_own ON cart_items
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM carts 
            WHERE carts.id = cart_items.cart_id 
            AND (carts.user_id = auth.uid() 
                 OR carts.session_id = current_setting('app.current_session_id', true))
        )
    );

CREATE POLICY cart_items_update_own ON cart_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM carts 
            WHERE carts.id = cart_items.cart_id 
            AND (carts.user_id = auth.uid() 
                 OR carts.session_id = current_setting('app.current_session_id', true))
        )
    );

CREATE POLICY cart_items_delete_own ON cart_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM carts 
            WHERE carts.id = cart_items.cart_id 
            AND (carts.user_id = auth.uid() 
                 OR carts.session_id = current_setting('app.current_session_id', true))
        )
    );

-- Helper function to get or create cart
CREATE OR REPLACE FUNCTION get_or_create_cart(p_user_id UUID, p_session_id TEXT)
RETURNS UUID AS $$
DECLARE
    v_cart_id UUID;
BEGIN
    -- Try to find existing active cart
    SELECT id INTO v_cart_id
    FROM carts
    WHERE status = 'active'
    AND (
        (p_user_id IS NOT NULL AND user_id = p_user_id)
        OR (p_session_id IS NOT NULL AND session_id = p_session_id)
    )
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If not found, create new cart
    IF v_cart_id IS NULL THEN
        INSERT INTO carts (user_id, session_id)
        VALUES (p_user_id, p_session_id)
        RETURNING id INTO v_cart_id;
    END IF;
    
    RETURN v_cart_id;
END;
$$ LANGUAGE plpgsql;

-- Function to merge guest cart to user cart on login
CREATE OR REPLACE FUNCTION merge_carts(p_user_id UUID, p_session_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_user_cart_id UUID;
    v_guest_cart_id UUID;
BEGIN
    -- Get user's cart
    SELECT id INTO v_user_cart_id
    FROM carts
    WHERE user_id = p_user_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- Get guest cart
    SELECT id INTO v_guest_cart_id
    FROM carts
    WHERE session_id = p_session_id AND status = 'active'
    AND user_id IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If both exist, merge items
    IF v_user_cart_id IS NOT NULL AND v_guest_cart_id IS NOT NULL THEN
        -- Move guest cart items to user cart
        UPDATE cart_items
        SET cart_id = v_user_cart_id
        WHERE cart_id = v_guest_cart_id;
        
        -- Delete guest cart
        DELETE FROM carts WHERE id = v_guest_cart_id;
    ELSIF v_guest_cart_id IS NOT NULL THEN
        -- Assign guest cart to user
        UPDATE carts
        SET user_id = p_user_id, session_id = NULL
        WHERE id = v_guest_cart_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
