# Birleşik Storefront Tema Yetkisi — Tasarım

**Durum:** Kullanıcı tarafından yazılı olarak onaylandı  
**Tarih:** 2026-08-04  
**Hedef:** `apps/customer-panel` içindeki `/settings/design` alanını logo, banner, renk, tipografi, ana sayfa bölümleri, ürün detayı, sepet ve footer için tek yazma/yayınlama yetkisi yapmak.

## Sorun

Bugünkü sistem iki bağımsız tema kaydı kullanıyor:

1. `storefront_designs` logo, favicon, renk, tipografi, banner, promosyon ve duyuruyu taslak/yayınlanmış sürümlerle saklıyor.
2. `starter_theme_composition` merchant-admin kaydı navigasyon, ana sayfa bölümleri, ürün detayı, sepet ve footer'ı ayrı bir taslak/yayınlama akışıyla saklıyor.

Storefront da bu iki yayını birbirini dışlayan iki farklı render yolunda okuyor. Sonuç olarak merchant panelinde yüklenen logo veya banner taslağa kaydolsa bile canlı vitrinde eski kompozisyon render edilebiliyor; kompozisyon yayınlandığında ise tasarım kaydındaki yüzeyler kaybolabiliyor.

## Karar

`saas.storefront_designs` mağaza başına tek, immutable sürümlü tema yetkisi olacaktır. Tema belgesinin şeması 3'e yükseltilir ve mevcut alanlara `composition: StarterThemeCompositionConfigV2` eklenir.

- Her alan önce aynı `draft_config` belgesine otomatik kaydedilir.
- Yalnız bir adet açık `Yayınla` eylemi atomik olarak bütün belgeyi `published_config` yapar.
- `StarterThemeComposer` artık repository/API sahibi değildir; kontrollü bir editördür ve yalnız `value`/`onChange` kontratıyla üst çalışma alanını değiştirir.
- Eski `starter_theme_composition` kayıtları salt-okunur geçmiş olarak tutulur; yeni tema yazımı veya anonim storefront yetkisi olmaz.
- Public storefront kompozisyonu yalnız `storefront_designs.published_config.composition` üzerinden çözer.

## Sözleşme

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

Public tasarım yanıtı ham tenant UUID'leri içeren kompozisyonu browser'a vermez. Public logo/banner/renk yanıtı ve çözümlenmiş `PublicStarterThemePresentationV3` ayrı, güvenli projeksiyonlar olarak kalır; ikisi aynı yayınlanmış belge sürümünden türetilir.

## Veri Geçişi

Migration 083:

1. Mevcut schema 1/2 tasarım belgelerini schema 3'e yükseltir.
2. Mağazanın son aktif starter kompozisyonunu draft ve published belgeye taşır.
3. Kompozisyon yoksa fail-safe varsayılan schema-v2 kompozisyon üretir.
4. Eski schema-v1 kompozisyonu kayıpsız biçimde schema-v2 alanlarıyla tamamlar.
5. `storefront_design_config_valid` ve publishability denetimlerini schema 3 ve tenant-owned referanslar için günceller.
6. `public_starter_retail_presentation` kompozisyonu yalnız yayınlanmış tema belgesinden okur.
7. Rollback, schema-3 veri kaybını sessizce yapmaz; açık güvenlik şartı olmadan reddeder.

Logo/banner medyası mevcut tenant-scoped R2 yolu olan `stores/{storeId}/design/{mediaId}.{ext}` üzerinde kalır. Kompozisyondaki eski `storefront_assets` referansları yalnız aynı mağazaya ait oldukları katalog kontrolüyle kabul edilir.

## UI Akışı

`/settings/design` tek çalışma alanıdır:

- `Tema düzeni`: header, navigasyon, ana sayfa bölüm sırası, ürün detayı, sepet ve footer.
- `Marka`: logo ve favicon.
- `Renkler`, `Yazı`, `Ana sayfa`, `Promosyon`, `Duyuru`: aynı belge içindeki mevcut alanlar.
- Üst durum her sekmede taslak durumunu ve tek `Yayınla` butonunu gösterir.
- Tema editörünün kendi “Taslak kaydet / Yayınla” butonları kaldırılır.
- Önizleme, aynı draft snapshot'ını kullanır.

## Storefront Birleştirme

Storefront, kompozisyon bulunduğunda her zaman `CampaignHome` yüzeyini kullanır. Yayınlanmış design hero/banner varsa versioned design hero öne geçer; yoksa taşınmış kompozisyon hero'su geriye uyumlu fallback olarak kalır. Logo, renk ve tipografi `StorefrontFrame` üzerinden uygulanır. Böylece yeni banner yayınlamak footer, ürün sıraları veya kategori bölümlerini ortadan kaldırmaz.

## Güvenlik ve Yetki

- Store/storeId browser'dan alınmaz; mevcut panel session ve `TenantContext` belirler.
- Bütün media, category, product ve page referansları aynı store'a ait olmalıdır.
- Draft optimistic version check ile güncellenir; publish draft/published version çiftini atomik kontrol eder.
- Public projeksiyon draft veriyi asla döndürmez.
- Eski merchant-admin endpoint'i yeni UI tarafından çağrılmaz.
- Production bağlantısı veya deploy bu uygulama çalışmasının parçası değildir.

## Test Stratejisi

- Contract: schema 1/2 upgrade, schema 3 exact-shape, kompozisyon reddi, public UUID sızıntısı yok.
- UI: tema editörü kontrollü, eski API/save çağrısı yok, tema sekmesinde tek publish, autosave aynı belgeyi gönderir.
- SQL/static: migration checksum, schema 3 backfill, tenant reference checks, public resolver tek authority, rollback guard.
- Storefront: logo/banner + kompozisyon aynı render'da; yeni design yayınında sections/footer korunur; legacy fallback korunur.
- Regresyon: saas-contracts, saas-data, customer-panel, storefront-shared test/typecheck/build; SQL harness; secret/forbidden API taraması.

