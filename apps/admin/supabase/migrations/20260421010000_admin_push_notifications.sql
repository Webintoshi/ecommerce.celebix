CREATE TABLE IF NOT EXISTS admin_inbox_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    href TEXT,
    entity_type TEXT,
    entity_id TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_inbox_notifications_user_created_idx
    ON admin_inbox_notifications(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_inbox_notifications_user_unread_idx
    ON admin_inbox_notifications(admin_user_id, read_at, created_at DESC);

ALTER TABLE admin_inbox_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to admin inbox notifications" ON admin_inbox_notifications;
CREATE POLICY "Service role has full access to admin inbox notifications"
    ON admin_inbox_notifications
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    platform TEXT,
    last_seen_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_push_subscriptions_user_idx
    ON admin_push_subscriptions(admin_user_id, disabled_at, updated_at DESC);

ALTER TABLE admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to admin push subscriptions" ON admin_push_subscriptions;
CREATE POLICY "Service role has full access to admin push subscriptions"
    ON admin_push_subscriptions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_admin_push_subscriptions_updated_at ON admin_push_subscriptions;
CREATE TRIGGER update_admin_push_subscriptions_updated_at
    BEFORE UPDATE ON admin_push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION notify_admins_on_new_product_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO admin_inbox_notifications (
        admin_user_id,
        type,
        title,
        body,
        href,
        entity_type,
        entity_id,
        payload
    )
    SELECT
        profiles.id,
        'new_product_review',
        'Yeni urun yorumu',
        COALESCE(NULLIF(NEW.reviewer_name, ''), 'Musteri') || ' yeni bir yorum gonderdi.',
        '/admin/urunler/yorumlar',
        'product_review',
        NEW.id::text,
        jsonb_build_object(
            'productId', NEW.product_id,
            'reviewId', NEW.id,
            'status', NEW.status
        )
    FROM profiles;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_inbox_new_product_review ON product_reviews;
CREATE TRIGGER admin_inbox_new_product_review
    AFTER INSERT ON product_reviews
    FOR EACH ROW
    EXECUTE FUNCTION notify_admins_on_new_product_review();
