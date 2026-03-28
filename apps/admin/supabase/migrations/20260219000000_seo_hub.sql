-- SEO Hub Topical Authority - Veri Modeli
-- Migration: 20260219000000_seo_hub.sql
-- Description: Pillar-Cluster içerik mimarisi için tablolar

-- ─────────────────────────────────────────
-- PILLAR TABLOSU (Ana kategoriler)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pillars (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT UNIQUE NOT NULL,          -- 'teknik-seo'
    title       TEXT NOT NULL,                 -- 'Teknik SEO'
    description TEXT,
    icon        TEXT,                          -- emoji veya icon name
    sort_order  SMALLINT DEFAULT 0,
    is_active   BOOLEAN DEFAULT true,

    -- SEO meta
    meta_title  TEXT,
    meta_desc   TEXT,

    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CLUSTER TABLOSU (İçerik sayfaları)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clusters (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pillar_id   UUID NOT NULL REFERENCES pillars(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL,                 -- 'core-web-vitals'
    title       TEXT NOT NULL,                 -- 'Core Web Vitals'
    description TEXT,

    -- İçerik metadata (MDX dosyasından parse edilir)
    mdx_file    TEXT NOT NULL,                 -- 'teknik-seo/core-web-vitals.mdx'
    word_count  INT,
    reading_time SMALLINT,                     -- dakika

    -- Arama hedefi
    primary_keyword   TEXT,                    -- 'core web vitals nedir'
    secondary_keywords TEXT[],
    search_intent TEXT CHECK (
        search_intent IN ('informational','navigational','commercial','transactional')
    ),

    -- Yayın durumu
    status      TEXT DEFAULT 'draft'
                CHECK (status IN ('draft','published','archived')),
    published_at TIMESTAMPTZ,

    -- SEO meta
    meta_title  TEXT,
    meta_desc   TEXT,

    sort_order  SMALLINT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(pillar_id, slug)
);

-- ─────────────────────────────────────────
-- CONTENT LINKS TABLOSU (İç linkleme haritası)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_links (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_type   TEXT NOT NULL CHECK (from_type IN ('pillar','cluster')),
    from_id     UUID NOT NULL,
    to_type     TEXT NOT NULL CHECK (to_type IN ('pillar','cluster')),
    to_id       UUID NOT NULL,
    anchor_text TEXT NOT NULL,
    link_type   TEXT DEFAULT 'contextual'
                CHECK (link_type IN ('contextual','related','hub-spoke')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(from_type, from_id, to_type, to_id)
);

-- ─────────────────────────────────────────
-- INDEXLER
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clusters_pillar  ON clusters(pillar_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_clusters_keyword ON clusters(primary_keyword);
CREATE INDEX IF NOT EXISTS idx_clusters_status  ON clusters(status);
CREATE INDEX IF NOT EXISTS idx_pillars_active    ON pillars(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_links_from       ON content_links(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_links_to         ON content_links(to_type, to_id);

-- ─────────────────────────────────────────
-- RLS (ROW LEVEL SECURITY) - Opsiyonel
-- ─────────────────────────────────────────
ALTER TABLE pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_links ENABLE ROW LEVEL SECURITY;

-- Public okuma izinleri (herkes okuyabilir)
CREATE POLICY "Public read access - pillars"
    ON pillars FOR SELECT
    TO public
    USING (true);

CREATE POLICY "Public read access - clusters"
    ON clusters FOR SELECT
    TO public
    USING (status = 'published');

CREATE POLICY "Public read access - content_links"
    ON content_links FOR SELECT
    TO public
    USING (true);

-- ─────────────────────────────────────────
-- TRIGGER - updated_at otomatik güncelleme
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pillars_updated_at BEFORE UPDATE ON pillars
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clusters_updated_at BEFORE UPDATE ON clusters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────
-- İLK PILLAR VERİLERİ (Seed Data)
-- ─────────────────────────────────────────
INSERT INTO pillars (slug, title, description, icon, sort_order, meta_title, meta_desc) VALUES
('teknik-seo', 'Teknik SEO', 'Site hızı, taranabilirlik ve teknik optimizasyon rehberleri', '⚙️', 1, 'Teknik SEO Rehberi 2026 | Site Hızı ve Optimizasyon', 'Teknik SEO konusunda kapsamlı rehberler. Core Web Vitals, site hızı, taranabilirlik ve daha fazlası.'),
('sayfa-ici-seo', 'Sayfa İçi SEO', 'İçerik optimizasyonu, anahtar kelime araştırması ve on-page faktörler', '📄', 2, 'On-Page SEO Rehberi | İçerik Optimizasyonu', 'Sayfa içi SEO teknikleri. Anahtar kelime araştırması, başlık etiketleri, meta açıklamalar ve içerik stratejileri.'),
('sayfa-disi-seo', 'Sayfa Dışı SEO', 'Backlink inşası, dijital PR ve marka mentions', '🔗', 3, 'Off-Page SEO Rehberi | Link Building Stratejileri', 'Backlink inşası ve dijital PR rehberi. Authority kazanmak için off-page SEO stratejileri.'),
('icerik-seo', 'İçerik SEO', 'Topikal otorite, içerik kümeleri ve programatik SEO', '📝', 4, 'İçerik SEO ve Topikal Otorite Rehberi', 'İçerik stratejisi ve topikal otorite. Pillar-cluster yapıları ve programatik SEO.'),
('yerel-seo', 'Yerel SEO', 'Google Business Profile ve lokal arama optimizasyonu', '📍', 5, 'Yerel SEO Rehberi | Lokal Arama Optimizasyonu', 'Yerel işletmeler için Google Business Profile optimizasyonu ve lokal SEO stratejileri.'),
('eticaret-seo', 'E-ticaret SEO', 'Ürün ve kategori sayfası optimizasyonu', '🛒', 6, 'E-ticaret SEO Rehberi | Online Mağaza Optimizasyonu', 'E-ticaret siteleri için ürün sayfası SEO, kategori optimizasyonu ve conversion stratejileri.'),
('uluslararasi-seo', 'Uluslararası SEO', 'Hreflang, coğrafi hedefleme ve çoklu dil', '🌍', 7, 'Uluslararası SEO Rehberi | Global SEO Stratejileri', 'Çoklu dil ve uluslararası hedefleme için hreflang ve geo-targeting rehberi.'),
('kurumsal-seo', 'Kurumsal SEO', 'Büyük ölçekli SEO otomasyonu ve yönetişim', '🏢', 8, 'Kurumsal SEO Yönetimi | Enterprise SEO', 'Büyük ölçekli SEO operasyonları için otomasyon, raporlama ve yönetişim stratejileri.'),
('ai-seo', 'AI SEO', 'Generative Engine Optimization ve LLM görünürlüğü', '🤖', 9, 'AI SEO ve GEO Rehberi | LLM Optimizasyonu', 'Yapay zeka çağında SEO. GEO, Perplexity ve ChatGPT optimizasyonu.'),
('analitik', 'SEO Analitik', 'Google Analytics, Search Console ve performans takibi', '📊', 10, 'SEO Analitik ve Raporlama Rehberi', 'Google Analytics 4, Search Console ve SEO metrikleri ile performans takibi.')
ON CONFLICT (slug) DO NOTHING;
