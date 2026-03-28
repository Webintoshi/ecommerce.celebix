-- =====================================================
-- REAL-TIME ANALYTICS TABLES
-- Run this in Supabase SQL Editor
-- =====================================================
-- User Sessions (Anlık ziyaretçi takibi)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT UNIQUE NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    country TEXT DEFAULT 'TR',
    city TEXT,
    device_type TEXT,
    -- mobile/desktop/tablet
    browser TEXT,
    os TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    page_views INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);
-- Page Views (Sayfa görüntülemeleri)
CREATE TABLE IF NOT EXISTS page_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT REFERENCES sessions(session_id) ON DELETE CASCADE,
    page_url TEXT NOT NULL,
    page_title TEXT,
    time_spent INTEGER DEFAULT 0,
    -- seconds
    scroll_depth INTEGER DEFAULT 0,
    -- percentage
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Events (Kullanıcı eylemleri)
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT REFERENCES sessions(session_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    -- add_to_cart, checkout_start, purchase, etc.
    event_data JSONB,
    page_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Checkout Sessions (Ödeme takibi)
CREATE TABLE IF NOT EXISTS checkout_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id TEXT REFERENCES sessions(session_id) ON DELETE CASCADE,
    cart_items JSONB NOT NULL,
    cart_total DECIMAL(10, 2) NOT NULL,
    step TEXT DEFAULT 'info',
    -- info, shipping, payment, complete
    email TEXT,
    phone TEXT,
    abandoned BOOLEAN DEFAULT false,
    abandoned_at TIMESTAMPTZ,
    recovered BOOLEAN DEFAULT false,
    order_id UUID REFERENCES orders(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_abandoned ON checkout_sessions(abandoned);
CREATE INDEX IF NOT EXISTS idx_checkout_sessions_session ON checkout_sessions(session_id);
-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;
-- Allow inserts from anonymous users (for tracking)
CREATE POLICY "Anyone can insert sessions" ON sessions FOR
INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert page_views" ON page_views FOR
INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert events" ON events FOR
INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert checkout_sessions" ON checkout_sessions FOR
INSERT WITH CHECK (true);
-- Service role has full access
CREATE POLICY "Service role has full access to sessions" ON sessions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to page_views" ON page_views FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to events" ON events FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role has full access to checkout_sessions" ON checkout_sessions FOR ALL USING (auth.role() = 'service_role');
-- =====================================================
-- TRIGGERS
-- =====================================================
-- Auto-update checkout_sessions updated_at
CREATE TRIGGER update_checkout_sessions_updated_at BEFORE
UPDATE ON checkout_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- =====================================================
-- FUNCTION: Increment page views for session
-- =====================================================
CREATE OR REPLACE FUNCTION increment_page_views(p_session_id TEXT) RETURNS void AS $$ BEGIN
UPDATE sessions
SET page_views = page_views + 1,
    last_activity_at = NOW(),
    is_active = true
WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;
-- =====================================================
-- FUNCTION: Mark inactive sessions
-- =====================================================
CREATE OR REPLACE FUNCTION mark_inactive_sessions() RETURNS void AS $$ BEGIN
UPDATE sessions
SET is_active = false
WHERE is_active = true
    AND last_activity_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;
-- =====================================================
-- FUNCTION: Mark abandoned checkouts
-- =====================================================
CREATE OR REPLACE FUNCTION mark_abandoned_checkouts() RETURNS void AS $$ BEGIN
UPDATE checkout_sessions
SET abandoned = true,
    abandoned_at = NOW()
WHERE abandoned = false
    AND order_id IS NULL
    AND step != 'complete'
    AND updated_at < NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql;