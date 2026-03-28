CREATE TABLE IF NOT EXISTS product_tag_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    value TEXT UNIQUE NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_tag_suggestions_usage_count
    ON product_tag_suggestions(usage_count DESC, last_used_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_tag_suggestions_value
    ON product_tag_suggestions(value);

ALTER TABLE product_tag_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'product_tag_suggestions'
          AND policyname = 'Service role has full access to product tag suggestions'
    ) THEN
        CREATE POLICY "Service role has full access to product tag suggestions"
            ON product_tag_suggestions
            FOR ALL
            USING (auth.role() = 'service_role');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_product_tag_suggestions_updated_at'
    ) THEN
        CREATE TRIGGER update_product_tag_suggestions_updated_at
        BEFORE UPDATE ON product_tag_suggestions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

WITH normalized_tags AS (
    SELECT
        CASE
            WHEN length(trim(regexp_replace(tag, '\s+', ' ', 'g'))) = 0 THEN NULL
            ELSE lower(
                replace(
                    replace(
                        trim(regexp_replace(tag, '\s+', ' ', 'g')),
                        'İ',
                        'i'
                    ),
                    'I',
                    'ı'
                )
            )
        END AS normalized_tag
    FROM products,
    LATERAL unnest(COALESCE(tags, ARRAY[]::TEXT[])) AS tag
),
aggregated_tags AS (
    SELECT normalized_tag AS value, COUNT(*)::INTEGER AS usage_count
    FROM normalized_tags
    WHERE normalized_tag IS NOT NULL
    GROUP BY normalized_tag
)
INSERT INTO product_tag_suggestions (value, usage_count, last_used_at)
SELECT value, usage_count, NOW()
FROM aggregated_tags
ON CONFLICT (value) DO UPDATE
SET usage_count = EXCLUDED.usage_count,
    last_used_at = EXCLUDED.last_used_at;
