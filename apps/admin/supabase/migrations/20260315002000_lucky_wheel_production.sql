-- =====================================================
-- LUCKY WHEEL V2 (PRODUCTION READY)
-- =====================================================

DROP FUNCTION IF EXISTS public.perform_lucky_wheel_spin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.decrement_prize_stock(UUID);

DROP TABLE IF EXISTS public.lucky_wheel_spins CASCADE;
DROP TABLE IF EXISTS public.lucky_wheel_prizes CASCADE;
DROP TABLE IF EXISTS public.lucky_wheel_configs CASCADE;

CREATE TABLE public.lucky_wheel_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    max_total_spins INTEGER NOT NULL DEFAULT 1000 CHECK (max_total_spins > 0),
    max_spins_per_user INTEGER NOT NULL DEFAULT 1 CHECK (max_spins_per_user > 0),
    cooldown_hours INTEGER NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 0),
    probability_mode TEXT NOT NULL DEFAULT 'percentage' CHECK (probability_mode IN ('percentage', 'weight')),
    require_membership BOOLEAN NOT NULL DEFAULT false,
    require_email_verified BOOLEAN NOT NULL DEFAULT false,
    wheel_segments INTEGER NOT NULL DEFAULT 8 CHECK (wheel_segments >= 2),
    primary_color TEXT NOT NULL DEFAULT '#FF6B35',
    secondary_color TEXT NOT NULL DEFAULT '#FFE66D',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.lucky_wheel_prizes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID NOT NULL REFERENCES public.lucky_wheel_configs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    prize_type TEXT NOT NULL CHECK (prize_type IN ('coupon', 'none')),
    probability_value NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (probability_value >= 0),
    stock_total INTEGER NOT NULL DEFAULT 0 CHECK (stock_total >= 0),
    stock_remaining INTEGER NOT NULL DEFAULT 0 CHECK (stock_remaining >= 0),
    is_unlimited_stock BOOLEAN NOT NULL DEFAULT false,
    color_hex TEXT NOT NULL DEFAULT '#FFFFFF',
    icon_emoji TEXT,
    image_url TEXT,
    display_order INTEGER NOT NULL DEFAULT 1 CHECK (display_order >= 1),
    is_active BOOLEAN NOT NULL DEFAULT true,
    coupon_prefix TEXT,
    coupon_type TEXT CHECK (coupon_type IN ('percentage', 'fixed')),
    coupon_value NUMERIC(10, 2),
    coupon_min_order NUMERIC(10, 2),
    coupon_validity_hours INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.lucky_wheel_spins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID NOT NULL REFERENCES public.lucky_wheel_configs(id) ON DELETE CASCADE,
    prize_id UUID REFERENCES public.lucky_wheel_prizes(id) ON DELETE SET NULL,
    user_email TEXT,
    user_phone TEXT,
    user_name TEXT NOT NULL,
    fingerprint_hash TEXT NOT NULL,
    request_ip TEXT,
    request_user_agent TEXT,
    idempotency_key TEXT NOT NULL,
    is_winner BOOLEAN NOT NULL DEFAULT false,
    prize_name TEXT,
    coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
    coupon_code TEXT,
    spin_number INTEGER NOT NULL,
    spin_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX lucky_wheel_spins_idempotency_key_idx ON public.lucky_wheel_spins(idempotency_key);
CREATE INDEX lucky_wheel_configs_active_idx ON public.lucky_wheel_configs(is_active);
CREATE INDEX lucky_wheel_prizes_config_idx ON public.lucky_wheel_prizes(config_id);
CREATE INDEX lucky_wheel_prizes_config_order_idx ON public.lucky_wheel_prizes(config_id, display_order);
CREATE INDEX lucky_wheel_spins_config_idx ON public.lucky_wheel_spins(config_id, created_at DESC);
CREATE INDEX lucky_wheel_spins_email_idx ON public.lucky_wheel_spins(user_email);
CREATE INDEX lucky_wheel_spins_phone_idx ON public.lucky_wheel_spins(user_phone);
CREATE INDEX lucky_wheel_spins_fingerprint_idx ON public.lucky_wheel_spins(fingerprint_hash);
CREATE INDEX lucky_wheel_spins_ip_idx ON public.lucky_wheel_spins(request_ip);

ALTER TABLE public.lucky_wheel_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucky_wheel_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucky_wheel_spins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lucky wheel active config is public"
ON public.lucky_wheel_configs
FOR SELECT
USING (is_active = true);

CREATE POLICY "Lucky wheel active prizes are public"
ON public.lucky_wheel_prizes
FOR SELECT
USING (is_active = true);

CREATE POLICY "Service role full access lucky_wheel_configs"
ON public.lucky_wheel_configs
FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access lucky_wheel_prizes"
ON public.lucky_wheel_prizes
FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access lucky_wheel_spins"
ON public.lucky_wheel_spins
FOR ALL
USING (auth.role() = 'service_role');

CREATE TRIGGER update_lucky_wheel_configs_updated_at
BEFORE UPDATE ON public.lucky_wheel_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lucky_wheel_prizes_updated_at
BEFORE UPDATE ON public.lucky_wheel_prizes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.perform_lucky_wheel_spin(
    p_config_id UUID,
    p_user_email TEXT,
    p_user_phone TEXT,
    p_user_name TEXT,
    p_fingerprint_hash TEXT,
    p_request_ip TEXT,
    p_request_user_agent TEXT,
    p_idempotency_key TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    can_spin BOOLEAN,
    message TEXT,
    remaining_spins INTEGER,
    spin_id UUID,
    prize_id UUID,
    prize_name TEXT,
    is_winner BOOLEAN,
    coupon_id UUID,
    coupon_code TEXT,
    spin_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config public.lucky_wheel_configs%ROWTYPE;
    v_existing_spin public.lucky_wheel_spins%ROWTYPE;
    v_prize public.lucky_wheel_prizes%ROWTYPE;
    v_now TIMESTAMPTZ := NOW();
    v_total_spins INTEGER := 0;
    v_email_count INTEGER := 0;
    v_phone_count INTEGER := 0;
    v_fingerprint_count INTEGER := 0;
    v_max_used INTEGER := 0;
    v_remaining INTEGER := 0;
    v_last_email_spin TIMESTAMPTZ;
    v_last_phone_spin TIMESTAMPTZ;
    v_last_fingerprint_spin TIMESTAMPTZ;
    v_latest_spin TIMESTAMPTZ;
    v_probabilities NUMERIC[];
    v_prize_ids UUID[];
    v_total_probability NUMERIC := 0;
    v_random NUMERIC := 0;
    v_cursor NUMERIC := 0;
    v_coupon_prefix TEXT := 'LUCKY';
    v_coupon_type TEXT := 'percentage';
    v_coupon_value NUMERIC := 10;
    v_coupon_min_order NUMERIC := 0;
    v_coupon_validity_hours INTEGER := 168;
    v_spin_number INTEGER := 0;
    v_coupon_id UUID;
    v_coupon_code TEXT;
    i INTEGER;
BEGIN
    IF p_idempotency_key IS NULL OR BTRIM(p_idempotency_key) = '' THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Idempotency key gerekli.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT * INTO v_existing_spin
    FROM public.lucky_wheel_spins
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        v_remaining := COALESCE((v_existing_spin.spin_result ->> 'remaining_spins')::INTEGER, 0);
        RETURN QUERY SELECT
            TRUE,
            TRUE,
            'Ayni istek daha once islenmis.',
            GREATEST(0, v_remaining),
            v_existing_spin.id,
            v_existing_spin.prize_id,
            v_existing_spin.prize_name,
            v_existing_spin.is_winner,
            v_existing_spin.coupon_id,
            v_existing_spin.coupon_code,
            v_existing_spin.created_at;
        RETURN;
    END IF;

    IF p_config_id IS NOT NULL THEN
        SELECT * INTO v_config
        FROM public.lucky_wheel_configs
        WHERE id = p_config_id
        FOR UPDATE;
    ELSE
        SELECT * INTO v_config
        FROM public.lucky_wheel_configs
        WHERE is_active = TRUE
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Aktif sans carki bulunamadi.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF NOT v_config.is_active THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Sans carki aktif degil.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF v_config.start_date IS NOT NULL AND v_config.start_date > v_now THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Sans carki henuz baslamadi.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF v_config.end_date IS NOT NULL AND v_config.end_date < v_now THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Sans carki sona erdi.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_total_spins
    FROM public.lucky_wheel_spins
    WHERE config_id = v_config.id;

    IF v_total_spins >= v_config.max_total_spins THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Toplam spin limiti doldu.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF p_user_email IS NOT NULL AND BTRIM(p_user_email) <> '' THEN
        SELECT COUNT(*)::INTEGER, MAX(created_at)
        INTO v_email_count, v_last_email_spin
        FROM public.lucky_wheel_spins
        WHERE config_id = v_config.id
          AND user_email = p_user_email;
    END IF;

    IF p_user_phone IS NOT NULL AND BTRIM(p_user_phone) <> '' THEN
        SELECT COUNT(*)::INTEGER, MAX(created_at)
        INTO v_phone_count, v_last_phone_spin
        FROM public.lucky_wheel_spins
        WHERE config_id = v_config.id
          AND user_phone = p_user_phone;
    END IF;

    SELECT COUNT(*)::INTEGER, MAX(created_at)
    INTO v_fingerprint_count, v_last_fingerprint_spin
    FROM public.lucky_wheel_spins
    WHERE config_id = v_config.id
      AND fingerprint_hash = p_fingerprint_hash;

    v_max_used := GREATEST(v_email_count, v_phone_count, v_fingerprint_count);
    IF v_max_used >= v_config.max_spins_per_user THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Spin hakkiniz tukenmis.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF v_config.cooldown_hours > 0 THEN
        v_latest_spin := GREATEST(
            COALESCE(v_last_email_spin, to_timestamp(0)),
            COALESCE(v_last_phone_spin, to_timestamp(0)),
            COALESCE(v_last_fingerprint_spin, to_timestamp(0))
        );

        IF v_latest_spin > to_timestamp(0) AND v_latest_spin + make_interval(hours => v_config.cooldown_hours) > v_now THEN
            RETURN QUERY SELECT FALSE, FALSE, 'Bekleme suresi dolmadi.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
            RETURN;
        END IF;
    END IF;

    SELECT
        ARRAY_AGG(id ORDER BY display_order),
        ARRAY_AGG(probability_value ORDER BY display_order),
        COALESCE(SUM(probability_value), 0)
    INTO v_prize_ids, v_probabilities, v_total_probability
    FROM public.lucky_wheel_prizes
    WHERE config_id = v_config.id
      AND is_active = TRUE
      AND (is_unlimited_stock = TRUE OR stock_remaining > 0);

    IF v_prize_ids IS NULL OR array_length(v_prize_ids, 1) IS NULL THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Aktif odul bulunamadi.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF v_total_probability <= 0 THEN
        v_total_probability := array_length(v_prize_ids, 1)::NUMERIC;
        v_probabilities := ARRAY(SELECT 1::NUMERIC FROM generate_series(1, array_length(v_prize_ids, 1)));
    END IF;

    v_random := random() * v_total_probability;
    FOR i IN 1..array_length(v_prize_ids, 1) LOOP
        v_cursor := v_cursor + COALESCE(v_probabilities[i], 0);
        IF v_random <= v_cursor OR i = array_length(v_prize_ids, 1) THEN
            SELECT * INTO v_prize
            FROM public.lucky_wheel_prizes
            WHERE id = v_prize_ids[i]
            FOR UPDATE;
            EXIT;
        END IF;
    END LOOP;

    IF v_prize.id IS NULL THEN
        RETURN QUERY SELECT FALSE, FALSE, 'Odul secilemedi.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    IF v_prize.is_unlimited_stock = FALSE THEN
        UPDATE public.lucky_wheel_prizes
        SET stock_remaining = stock_remaining - 1,
            updated_at = NOW()
        WHERE id = v_prize.id
          AND stock_remaining > 0;

        IF NOT FOUND THEN
            RETURN QUERY SELECT FALSE, FALSE, 'Secilen odulun stogu tukenmis.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
            RETURN;
        END IF;
    END IF;

    IF v_prize.prize_type = 'coupon' THEN
        v_coupon_prefix := UPPER(REGEXP_REPLACE(COALESCE(v_prize.coupon_prefix, 'LUCKY'), '[^A-Z0-9_-]', '', 'g'));
        IF v_coupon_prefix = '' THEN
            v_coupon_prefix := 'LUCKY';
        END IF;
        v_coupon_type := COALESCE(v_prize.coupon_type, 'percentage');
        v_coupon_value := COALESCE(v_prize.coupon_value, 10);
        v_coupon_min_order := COALESCE(v_prize.coupon_min_order, 0);
        v_coupon_validity_hours := COALESCE(v_prize.coupon_validity_hours, 168);

        FOR i IN 1..50 LOOP
            v_coupon_code := FORMAT(
                '%s-%s',
                v_coupon_prefix,
                UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT || i::TEXT) FROM 1 FOR 8))
            );

            INSERT INTO public.coupons (
                code,
                type,
                value,
                min_order,
                max_uses,
                used_count,
                starts_at,
                expires_at,
                is_active
            ) VALUES (
                v_coupon_code,
                v_coupon_type,
                v_coupon_value,
                v_coupon_min_order,
                1,
                0,
                NOW(),
                NOW() + make_interval(hours => v_coupon_validity_hours),
                TRUE
            )
            ON CONFLICT (code) DO NOTHING
            RETURNING id INTO v_coupon_id;

            EXIT WHEN v_coupon_id IS NOT NULL;
        END LOOP;

        IF v_coupon_id IS NULL THEN
            RETURN QUERY SELECT FALSE, FALSE, 'Kupon olusturulamadi.', 0, NULL::UUID, NULL::UUID, NULL::TEXT, FALSE, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ;
            RETURN;
        END IF;
    END IF;

    SELECT COALESCE(MAX(spin_number), 0) + 1 INTO v_spin_number
    FROM public.lucky_wheel_spins
    WHERE config_id = v_config.id;

    v_remaining := GREATEST(0, v_config.max_spins_per_user - (v_max_used + 1));

    INSERT INTO public.lucky_wheel_spins (
        config_id,
        prize_id,
        user_email,
        user_phone,
        user_name,
        fingerprint_hash,
        request_ip,
        request_user_agent,
        idempotency_key,
        is_winner,
        prize_name,
        coupon_id,
        coupon_code,
        spin_number,
        spin_result
    )
    VALUES (
        v_config.id,
        v_prize.id,
        NULLIF(BTRIM(p_user_email), ''),
        NULLIF(BTRIM(p_user_phone), ''),
        p_user_name,
        p_fingerprint_hash,
        p_request_ip,
        p_request_user_agent,
        p_idempotency_key,
        (v_prize.prize_type = 'coupon'),
        v_prize.name,
        v_coupon_id,
        v_coupon_code,
        v_spin_number,
        jsonb_build_object(
            'prize_id', v_prize.id,
            'prize_type', v_prize.prize_type,
            'wheel_segment', v_prize.display_order,
            'remaining_spins', v_remaining
        )
    )
    RETURNING * INTO v_existing_spin;

    RETURN QUERY SELECT
        TRUE,
        TRUE,
        CASE WHEN v_prize.prize_type = 'coupon' THEN 'Tebrikler! Odul kazandiniz.' ELSE 'Bu turda odul cikmadi.' END,
        v_remaining,
        v_existing_spin.id,
        v_existing_spin.prize_id,
        v_existing_spin.prize_name,
        v_existing_spin.is_winner,
        v_existing_spin.coupon_id,
        v_existing_spin.coupon_code,
        v_existing_spin.created_at;
END;
$$;

INSERT INTO public.lucky_wheel_configs (
    id,
    name,
    is_active,
    start_date,
    end_date,
    max_total_spins,
    max_spins_per_user,
    cooldown_hours,
    probability_mode,
    require_membership,
    require_email_verified,
    wheel_segments,
    primary_color,
    secondary_color
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Celebix Sans Carki',
    false,
    NOW(),
    NOW() + INTERVAL '12 months',
    5000,
    1,
    24,
    'percentage',
    false,
    false,
    8,
    '#FF6B35',
    '#FFE66D'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lucky_wheel_prizes (
    config_id,
    name,
    description,
    prize_type,
    probability_value,
    stock_total,
    stock_remaining,
    is_unlimited_stock,
    color_hex,
    icon_emoji,
    display_order,
    is_active,
    coupon_prefix,
    coupon_type,
    coupon_value,
    coupon_min_order,
    coupon_validity_hours
)
VALUES
('00000000-0000-0000-0000-000000000001', '%20 Indirim', 'Tek kullanimlik kupon', 'coupon', 10, 500, 500, false, '#FF6B6B', '🎁', 1, true, 'WHEEL20', 'percentage', 20, 0, 168),
('00000000-0000-0000-0000-000000000001', '%15 Indirim', 'Tek kullanimlik kupon', 'coupon', 15, 800, 800, false, '#4ECDC4', '🎉', 2, true, 'WHEEL15', 'percentage', 15, 0, 168),
('00000000-0000-0000-0000-000000000001', '%10 Indirim', 'Tek kullanimlik kupon', 'coupon', 20, 1200, 1200, false, '#45B7D1', '⭐', 3, true, 'WHEEL10', 'percentage', 10, 0, 168),
('00000000-0000-0000-0000-000000000001', 'Sansini Dene', 'Bu turda odul yok', 'none', 55, 0, 0, true, '#C0C0C0', '🔄', 4, true, null, null, null, null, null)
ON CONFLICT DO NOTHING;
