# Mağaza destek özellikleri — 3 Ekim 2026

## Kapsam

- Tasarım → Yan sepet: isteğe bağlı ücretsiz kargo çubuğu ve mağazanın belirlediği gerçek TRY eşiği.
- Ürünler → Yorumlar: moderasyon, satın alma doğrulaması, manuel davet ve isteğe bağlı teslimat sonrası otomatik davet. Mağaza aracı değildir.
- Ayarlar → Mağaza araçları: seçilen tükenen varyant için onaylı tek seferlik stok e-postası.
- Yeni ayarlar varsayılan kapalıdır. Yeni ücretli servis veya bağımlılık eklenmedi.

## Kod ve uyumluluk

Uygulama adayı: `f7b51d1ba40c3580e4a063185493c74c7cf9b480`, `codex/store-engagement-tools`.
Mira’nın onaylı `20002532` arayüzü birleştirildi; stok penceresinin bağımsız CSS kapsamı ve 44 px kontrolleri ayrıca doğrulandı.
Yayın başlangıcı: storefront NET/SITE `02611e0b`; panel NET/SITE `20002532`.
PayTR kaynakları, üretici ve mevcut onay profilleri korunur. Resmî üretici ve kontrol çıktıları aday ile başlangıç sürümlerine bağlıdır.

## Test kanıtları

- Contracts: 545/545; ödeme/sepet regresyonu: 129/129.
- Birleşik panel araçları: 24/24; panel üretim derlemesi son adayda başarılı.
- Storefront üretim derlemesi başarılı; son değişiklik yalnız panel penceresinin CSS kapsamıdır.
- Native PostgreSQL: kargo, yorum daveti/moderasyonu ve varyant stok bildirimi kabul akışları başarılı.
- Birleşik SQL205/206/207 harness: 7/7; gerçek aday bağlantılı yayın zarfı: 13/13.
- Admin arayüzü 1440/1024/390 px: taşma yok; Vazgeç, odak dönüşü ve mobil düğme erişimi doğrulandı.
- Aynı gönderim içeriği/işlem anahtarı, tekrar yetkilendirme, opt-out, mağaza ayrımı, stok/rezervasyon ve süre sonu kontrolleri test edildi.

## Canlı veritabanı

Özel geri dönüş yedeği sunucuda 0600 olarak tutulur; 44.229.775 bayt, SHA256 `d34f9b2728224d04a01db4625e2a9a281e40f8825116f94439b126d36f06bbfe`.
Veritabanı `celebix_saas_staging_auth01`, systemID `7662620785858093099`.
Gerçek SQL provası ROLLBACK ile, ardından uygulama COMMIT ile tamamlandı.
Her iki işlemde 289 iş tablosunun verisi ve 1570 mevcut fonksiyonun OID/yetkileri korundu; ilgisiz fonksiyon kaynakları aynı kaldı.
Yeni özellik geçmişi oluştuğunda DOWN korumaları bu geçmişi silmek yerine geri almayı reddeder.

## Canlı uygulama yayını

Ortak uygulamalar aşağıdaki sırayla yayımlandı. Dördünün çalışan imajı ve `SOURCE_COMMIT` değeri uygulama adayı `f7b51d1ba40c3580e4a063185493c74c7cf9b480` ile eşleşti.

| Uygulama | Coolify yayın kimliği | Sonuç |
|---|---|---|
| Storefront NET | `hsv56cwy088stbvf04un8vkm` | Tamamlandı |
| Storefront SITE | `st3uqmv46so6px01gym1cmz5` | Tamamlandı |
| Panel NET | `gwa6au9jaoev895pvyvh746t` | Tamamlandı |
| Panel SITE | `rc8mjwcjfx7wtvqengz9cett` | Tamamlandı |

Son yayın kontrolü dört hedefi doğruladı ve ortak yayın kuyruğunu boş buldu. Derlenmiş resmî PayTR metadata ve onay profilleri aynı kaldı. Her iki storefrontta bildirim görevinin rol/şema önkontrolü ve çalışan süreci doğrulandı; yeni public yollar ve API yöntem/yetki kontrolleri geçti.

3 Ekim 2026 15:27 UTC erişim kontrolünde Güzide, Lilyum, Alpler Spor ve Butik Siora'nın hem storefront hem admin sağlık uçları toplam sekiz HTTP 200 / `ok` yanıtı verdi.

## Canlı kullanıcı kabulü

Butik Siora mağaza sahibi oturumunda gerçek üretim ekranları kullanıldı:

- Stok bildirimi kapalı ayarlarla Uygula ile kaydedildi, sayfa yenilendikten sonra kapalı kaldı. Açılan fakat kaydedilmeyen seçenek Vazgeç ile bırakıldı; yeniden açıldığında kapalıydı.
- Yorum daveti kapalıyken süre 8 gün olarak kaydedildi; ardından 7 güne geri kaydedildi. Yeniden yükleme sonrası kapalı / 7 gün doğrulandı. Vazgeç, kaydedilmeyen etkinleştirmeyi bıraktı.
- Yan sepette ücretsiz kargo seçeneği açıldığında eşik alanı göründü. `6600,50` geçerli kabul edildi; `0` Uygula'yı engelledi. Vazgeç sonrası mevcut kapalı tasarım korundu; üretimde kargo politikası değiştirilmedi.
- Son salt okunur veritabanı kontrolünde açık stok bildirimi ve otomatik yorum daveti ayarı sıfırdı. Davet, stok aboneliği ve stok gönderim sayıları sıfırdı; mevcut üç ürün yorumu korundu.

Ekran kanıtları ve test sınırları: [canlı kabul raporu](../qa/store-engagement-2026-10-03.md).

## Test sınırı

Gerçek müşterilere test daveti veya stok e-postası gönderilmedi. Sağlayıcı taşıması kontrollü testlerle; canlı bağlantı, rol/şema önkontrolü ve çalışan görev süreci üzerinden doğrulandı. Bu çalışmada gerçek e-posta teslim alındığı iddia edilmez. Gerçek ücretsiz kargo tutarı ve müşteri token akışları izole native PostgreSQL kabul testlerinde doğrulandı; canlı mağazaya sahte sipariş veya müşteri talebi yazılmadı.
