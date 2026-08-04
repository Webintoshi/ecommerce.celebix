# Birleşik Storefront Tema Yetkisi — Uygulama Planı

> **Execution:** `superpowers:executing-plans`, red/green TDD, küçük bağımsız commit sınırları.

**Amaç:** `/settings/design` ile canlı starter storefront arasında tek draft/publish authority kurmak; logo/banner ile kompozisyonu aynı atomik yayın içinde yaşatmak.

**Mimari:** `StorefrontDesignDocument` schema 3 kompozisyonu da içerir. Customer-panel tema editörü kontrollü bileşene dönüşür. Migration 083 mevcut starter kompozisyonu tasarım belgesine taşır ve public resolver'ı bu belgeye bağlar. Storefront, design yüzeyleriyle kompozisyon bölümlerini tek ağaçta render eder.

---

## Görev 1 — Schema 3 contract

- [ ] `packages/saas-contracts/src/storefront-design/validation.test.ts:1-400` içine schema-3 composition round-trip, schema-2 default upgrade, malformed composition ve public raw UUID sızıntısı testleri ekle.
- [ ] Kırmızı testi çalıştır:

```bash
npm test --workspace @celebix/saas-contracts -- --test-name-pattern='storefront design.*composition'
```

Beklenen hata: schema 3 exact-shape ve `composition` henüz kabul edilmediği için `storefront_design_contract_invalid`.

- [ ] `packages/saas-contracts/src/storefront-design/types.ts:64-156` içinde belge/workspace şemasını 3'e yükselt ve kompozisyonu ekle:

```ts
export type StorefrontDesignDocument = Readonly<{
  schemaVersion: 3;
  brand: StorefrontDesignBrand;
  hero: StorefrontDesignHero;
  promotion: StorefrontDesignPromotion;
  announcement: StorefrontDesignAnnouncement;
  composition: StarterThemeCompositionConfigV2;
}>;
```

- [ ] `packages/saas-contracts/src/storefront-design/validation.ts:183-360` içinde `parseStarterThemeCompositionConfig` ile schema 3'ü exact parse et; schema 1/2 girdilerini fail-safe v2 default kompozisyonla normalize et. Public projeksiyonda kompozisyonu dışarı verme.
- [ ] `packages/saas-contracts/src/storefront-design/defaults.ts:1-160` ve export dosyalarında tek `createDefaultStarterThemeComposition()` yardımcısı oluştur; customer-panel ve migration fixture'ları aynı shape'i kullansın.
- [ ] Yeşil doğrulama:

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Beklenen: mevcut 226 teste yeni contract testleri eklenmiş toplamın tamamı PASS.

- [ ] Commit: `feat(storefront): version unified theme document`

## Görev 2 — PostgreSQL authority migration 083

- [ ] `apps/owner/scripts/sql/saas/storefront-unified-theme-authority-migration.test.ts:1-180` testini önce yaz. Migration'ın schema 3 backfill, aktif legacy kompozisyon taşıma, tenant-owned reference doğrulama, yalnız published config public okuma ve guarded rollback şartlarını source/catalog düzeyinde ispatla.
- [ ] Kırmızı testi çalıştır:

```bash
node --import tsx --test apps/owner/scripts/sql/saas/storefront-unified-theme-authority-migration.test.ts
```

Beklenen hata: 083 artifact ve manifest dosyaları yok.

- [ ] Şu dosyaları ekle:
  - `apps/owner/scripts/sql/saas/202608040083_storefront_unified_theme_authority.up.sql:1-520`
  - `apps/owner/scripts/sql/saas/202608040083_storefront_unified_theme_authority.down.sql:1-120`
  - `apps/owner/scripts/sql/saas/202608040083_storefront_unified_theme_authority_assertions.sql:1-180`
  - `apps/owner/scripts/sql/saas/phase3-storefront-unified-theme-authority-manifest.json:1-30`

Up migration'ın çekirdeği:

```sql
UPDATE saas.storefront_designs AS design
SET draft_config = jsonb_set(design.draft_config || '{"schemaVersion":3}'::jsonb, '{composition}', legacy.config, true),
    published_config = jsonb_set(design.published_config || '{"schemaVersion":3}'::jsonb, '{composition}', legacy.config, true),
    schema_version = 3
FROM LATERAL (
  SELECT publication.config
  FROM saas.campaign_starter_publications AS publication
  WHERE publication.store_id = design.store_id
  LIMIT 1
) AS legacy;
```

Kompozisyon bulunmayan satırlar güvenli default ile tamamlanır. Public resolver başlangıcı yalnız şunu kullanır:

```sql
SELECT published_config -> 'composition'
INTO config
FROM saas.storefront_designs
WHERE store_id = p_store_id;
```

- [ ] Manifest SHA-256 değerlerini gerçek dosyalardan üret; migration 001–083 sırasını statik testte doğrula.
- [ ] Yeşil doğrulama:

```bash
node --import tsx --test apps/owner/scripts/sql/saas/storefront-unified-theme-authority-migration.test.ts
npm test --workspace @celebix/owner -- --test-name-pattern='storefront.*design|starter.*theme'
```

- [ ] PostgreSQL 16 disposable harness varsa up/assertions/down/reapply çalıştır; yoksa `NOT_EXECUTED` olarak raporla ve PASS iddiasında bulunma.
- [ ] Commit: `feat(saas): unify storefront theme authority`

## Görev 3 — Controlled composer ve tek publish

- [ ] `apps/customer-panel/components/settings/StarterThemeComposer.test.tsx:1-320` testlerini önce değiştir/ekle: `value` render, `onChange` emit, `merchantAdminApi.save/records` çağrısı 0, bağımsız publish butonu 0.
- [ ] `apps/customer-panel/components/settings/design/DesignWorkspace.test.tsx:1-360` testine tema sekmesinde üst `Yayınla`, composition autosave ve aynı payload publish senaryosunu ekle.
- [ ] `apps/customer-panel/lib/merchant-admin-console.test.ts` içindeki iki stale route expectation'ı yalnız unified design redirect beklentisine göre düzelt.
- [ ] Kırmızı testler:

```bash
npm test --workspace @celebix/customer-panel -- --test-name-pattern='StarterThemeComposer|DesignWorkspace|donor merchant module route'
```

Beklenen: eski composer props ve bağımsız API/publish davranışı nedeniyle fail.

- [ ] `apps/customer-panel/components/settings/StarterThemeComposer.tsx:150-288` kontratını değiştir:

```ts
export function StarterThemeComposer({ value, onChange, canManage }: Readonly<{
  value: StarterThemeCompositionConfigV2;
  onChange(next: StarterThemeCompositionConfigV2): void;
  canManage: boolean;
}>) { /* controlled editor; repository write yok */ }
```

- [ ] `apps/customer-panel/components/settings/design/DesignWorkspace.tsx:15-90` tema sekmesinde de topbar action'larını göster, composer'a `editor.design.composition` ver ve değişiklikte `{...editor.design, composition}` uygula.
- [ ] Tema editöründen `Taslak kaydet` ve `Yayınla` butonlarını, eski `merchantAdminApi.records/save` akışını kaldır. Resource seçenekleri salt-okunur tenant-scoped endpointlerden yüklenebilir.
- [ ] Yeşil doğrulama:

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Beklenen: customer-panel workspace testlerinin tamamı PASS; pre-existing stale failure kapanmış.

- [ ] Commit: `refactor(customer-panel): publish design from one workspace`

## Görev 4 — Tek storefront render ağacı

- [ ] `apps/storefront-shared/lib/storefront-design-publication.test.ts:1-260` içine şu kırmızı senaryoları ekle:
  - schema-3 design logo/banner yayınında campaign category/product/footer bölümleri korunur;
  - design hero legacy campaign hero'nun yerine yalnız bir kere görünür;
  - schema-1 legacy storefront fallback değişmez.
- [ ] `apps/storefront-shared/app/page.test.tsx` veya mevcut home testinde logo/banner + kompozisyon birlikte render assertion'ı ekle.
- [ ] Kırmızı test:

```bash
npm test --workspace @celebix/storefront-shared -- --test-name-pattern='unified theme|published design'
```

Beklenen: mevcut `publicationVersion > 1` dalı `CampaignHome` bölümlerini tamamen attığı için fail.

- [ ] `apps/storefront-shared/app/page.tsx:1-100` içinde campaign varsa her sürümde campaign-aware render kullan.
- [ ] `apps/storefront-shared/components/CampaignHome.tsx:1-180` içinde versioned design yüzeyleri aktifken campaign hero/announcement tekrarını filtrele ve kalan bölümleri `StorefrontDesignRenderer` children olarak render et:

```tsx
const sections = customDesign
  ? presentation.sections.filter((section) => section.kind !== "hero")
  : presentation.sections;
```

Logo, renk ve tipografi `StorefrontFrame`/`CampaignHeader` üzerinden aynı public design ile uygulanır.
- [ ] Yeşil doğrulama:

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Beklenen: mevcut 333 teste yeni unified-render testleri eklenmiş toplamın tamamı PASS.

- [ ] Commit: `fix(storefront): render published design with starter sections`

## Görev 5 — Tam doğrulama ve yayın hazırlığı

- [ ] Tam regresyon:

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
npm run build --workspace @celebix/owner
git diff --check
```

- [ ] Güvenlik taramaları:

```bash
git diff --unified=0 HEAD~4...HEAD | rg -n 'BEGIN (RSA|OPENSSH)|DATABASE_URL=|AWS_SECRET|R2_SECRET|SUPABASE|rawState|access_token'
rg -n 'merchantAdminApi\.(save|records)\("starter_theme_composition"' apps/customer-panel
rg -n 'campaign_starter_publications' apps/customer-panel apps/storefront-shared packages/storefront-design-ui
```

Beklenen: secret 0; yeni UI legacy theme write 0; runtime legacy publication authority 0.

- [ ] Local görsel kabul: `/settings/design?section=theme` içinde tek Publish; logo/banner draft; publish sonrası storefront ana sayfasında logo, banner, navigation, ürün bölümü ve footer aynı anda görünür. Desktop 1440×900 ve mobile 390×844 ekran görüntüleri.
- [ ] `apps/admin/**` diff sayısı 0; production impact 0.
- [ ] Commit/push parity:

```bash
git status --short
git push -u origin codex/storefront-unified-theme-authority
git rev-parse HEAD
git rev-parse origin/codex/storefront-unified-theme-authority
```

- [ ] Yalnız gerekli staging migration ve customer-panel/storefront targeted deploy için mevcut yetkiyi kullan; exact SHA'yı doğrula. Production deploy/mutation/merge yapma.

