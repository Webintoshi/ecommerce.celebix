# Multichannel Catalog Import Design

**Status:** Kullanıcı tarafından 26 Temmuz 2026 tarihinde yazılı olarak onaylandı.

## Amaç

Hemenaku donorundaki dört adımlı ürün aktarım deneyimini `apps/customer-panel` içinde, shared-SaaS PostgreSQL kataloğu ve `TenantContext` tek yetki kaynağı kalacak şekilde kurmak. Teslimat hem dosyadan toplu aktarımı hem de güvenli bir HTTPS feed adresinden manuel aktarımı gerçekten çalıştırır; `apps/admin` salt-okunur donor olarak kalır.

## Kullanıcı deneyimi

`/products/bulk-upload` tek sayfada iki kaynak sunar:

1. **Dosyadan aktarım:** WooCommerce, Shopify, IdeaSoft, Ticimax, T-Soft, ikas, OpenCart, PrestaShop, Magento, BigCommerce, Wix ve Genel CSV.
2. **Feed adresinden aktarım:** doğrulanmış bir HTTPS URL'den CSV, JSON veya XML ürün feed'i.

Her iki kaynak da aynı dört aşamayı kullanır: platform seçimi, kaynak seçimi, salt-okunur önizleme, kalıcı aktarım. Önizleme ürün/varyant sayısını, atlanan satırları ve sabit güvenli hata kodlarını gösterir. Sağlayıcıya ait UTF-8 CSV şablonu tarayıcıda indirilebilir.

## Veri modeli

Bir aktarım ürünü şu kanonik alanlara dönüştürülür:

- `title`, `slug`, isteğe bağlı `description`, `status`;
- en az bir varyant;
- varyant başlığı, SKU, barkod, fiyat, karşılaştırma fiyatı, maliyet, stok ve en fazla 32 metin niteliği.

Kategori, etiket, SEO metafield ve uzaktaki görsel URL'leri mevcut shared katalog şemasında yetkili alanlar değildir. Bu görev bunları sessizce kalıcıymış gibi göstermeyecek; önizlemede `unsupported_fields_ignored` uyarısı verecek. Ürün görselinin gerçek R2 aktarımı mevcut ayrı ürün-medya yetkisi üzerinden ilerlemelidir ve bu görevde sahte başarı üretilmez.

## Ayrıştırıcı sınırı

Ortamdan bağımsız `catalog-import` modülü sağlayıcı tanımlarını, şablonları, CSV ayrıştırmayı ve kayıtların kanonikleştirilmesini içerir. CSV ayraçları virgül, noktalı virgül ve tabdır; tırnak, BOM ve CRLF doğru işlenir. Shopify satırları `Handle` ile gruplanır. Diğer sağlayıcılarda slug veya güvenli satır anahtarı kullanılır. Dosya ve feed aynı kanonikleştiriciyi kullanır.

Sınırlar:

- en fazla 512 KiB kaynak;
- en fazla 500 veri satırı;
- aktarım başına en fazla 100 ürün;
- ürün başına en fazla 50 varyant;
- duplicate slug/SKU fail-closed;
- kontrol karakterleri, bozuk tırnaklar, taşan sayılar ve bilinmeyen platform reddedilir.

## Feed güvenliği

Feed yalnız server-side alınır. URL exact-trimmed, canonical HTTPS, kimlik bilgisi/fragmentsiz ve en fazla 2048 karakter olmalıdır. Localhost, `.local`, private/link-local/loopback/reserved IPv4 ve IPv6 adresleri; özel portlar; DNS cevabı bulunmayan veya public olmayan hostlar reddedilir. Yönlendirmeler manuel, en fazla üç ve her hedef yeniden doğrulanmış olmalıdır. Yanıt süresi 10 saniye, gövde 512 KiB ile sınırlıdır. Kabul edilen temel medya tipleri yalnız CSV, JSON ve XML listeleridir. URL veya feed içeriği loglanmaz ve kalıcı iş kaydında yalnız güvenli kaynak etiketi tutulur.

Feed önizlemesi mevcut panel session, exact Origin ve `catalog_admin.import` yetkisinden geçer. Host, query, cookie dışındaki browser header'ları, store ID veya tenant ID yetki kaynağı değildir.

## Kalıcılık ve tekrar güvenliği

Mevcut `catalog_admin_import_products` yetkisi zengin varyant dizisini tek PostgreSQL transaction içinde işler. Ürün limiti row lock altında doğrulanır. Ürünler, varyantlar, import job ve idempotency proof birlikte commit olur; bir hata tüm aktarımı geri alır. Aynı operation ID ve aynı fingerprint replay edilir, farklı payload `operation_mismatch` üretir. Store-scoped slug/SKU çakışması `import_conflict` olur; zaman ekli sahte duplicate oluşturulmaz.

## UI ve erişilebilirlik

Konsol mevcut Celebix/Hemenaku merchant-shell tasarımını kullanır: turuncu vurgu, dört adımlı ilerleme, platform kartları, dosya/feed sekmeleri, özet metrikleri ve import geçmişi. Desktop ve mobile layout yatay taşma üretmez. Bütün kontrol hedefleri en az 48×48 px, klavye odağı görünür ve hata/başarı metinleri `role=alert/status` ile duyurulur.

## Test ve kabul

- Her 12 sağlayıcı için en az bir gerçekçi fixture başarıyla kanonikleşir.
- Shopify çok satırlı varyant gruplaması kanıtlanır.
- CSV/JSON/XML feed aynı kalıcı import sözleşmesine ulaşır.
- SSRF, redirect, boyut, zaman aşımı, MIME ve malformed input negatifleri ağ veya repository çağrısından önce kapanır.
- PostgreSQL 16 harness; tenant izolasyonu, limit, duplicate, replay, operation mismatch, rollback/reapply ve cleanup kanıtlarını çalıştırır.
- Customer-panel, saas-data, Owner regresyonu, typecheck, build, static-security ve secret scan geçer.
- `apps/admin/**` diff sayısı sıfırdır; production deploy/mutation yapılmaz.

## Kapsam dışı

Zamanlanmış background feed scheduler, production deploy ve uzaktaki görsellerin R2'ye otomatik kopyalanması ayrı authority/lifecycle tasarımı gerektirir. Bu görev manuel feed'i gerçekten çalıştırır; olmayan scheduler veya görsel aktarımını varmış gibi göstermez.
