# Siora ürün sayfası header düzeltmesi

2 Ekim 2026. Siora'nın immersive ürün sayfasında ortak header'ı atlayan koşul kaldırıldı. Arama, logo, hesap, sepet ve masaüstü menü sırası artık ürün sayfasında da gösterilir. Checkout kendi header'ını kullanmaya devam eder; diğer tenantların header seçimi değişmez.

Galeri, ölçülen header yüksekliği çıkarılarak ekranın kalan alanını kullanır. Header yüksekliği yalnızca mount/ResizeObserver ile ölçülür; scroll sırasında ek ölçüm yapılmaz. Observer ve CSS değişkeni unmount sırasında temizlenir. Galeri üzerindeki eski sepet kısayolu, gerçek header bulunan sayfada gizlenir.

Mobil eşik header ile birlikte 767px'tir. Satın alma çubuğu sabit alt menünün üzerinde, safe-area boşluğu bir kez uygulanarak yerleşir. Ürün mount'unda çalışan katalog dönüş hook'u, gerçek varyant kimlikleri ve CartStatusProvider korunur.

## Doğrulama

- Yeni StorefrontFrame regresyonları: 4/4; immersive Siora header'ı, checkout önceliği, normal Siora ve diğer tenantlar.
- Tam storefront-shared test paketi: 769/769 (719 server, 50 browser); başarısız/atlanan test yok. Tip kontrolü ve production build başarılı.
- Yerel tarayıcı: 1280×720'de header 135px, galeri 585px; satın alma kartının altı 687px, yatay taşma yok.
- 768×700'de masaüstü düzeni korunur; satın alma kartının altı 672px, yatay taşma yok.
- 390×844 ve 320×740 mobilde header 65px; sepet için tek görünür kısayol. 320px'te satın alma barının altı 676px, alt menünün üstü 676px; çakışma ve yatay taşma yok.
- Mobil menü ve arama pencereleri, beden seçimi ve yerel sepet drawer'ı çalışır. Katalogdan ürün açılıp Geri ile dönüldüğünde seçilen kart görünür konuma geri gelir.
- Bağımsız kaynak ve yayın paketi incelemesi PASS.

## Yayın

Kaynak aday: `4793ef08eedb4da17f6c7df0920a538a4dc88504`. Baseline `138e073ecde396d026787e45cbcb7b0915896898` adayın atasıdır; BKM dahil son ödeme düzeltmeleri korunur. Storefront lib, payment-adapters ve resmi generator baseline ile aynıdır.

Resmi generator ve check, baseline/aday × noApproval/reviewedTestLive kombinasyonlarında izole ortamda çalıştı. Dört artifact, kaynak manifesti ve canonical TEST/LIVE yetkileri doğrulandı. Yayından önce iki gerçek baseline image, SOURCE_COMMIT, health ve SITE veritabanı authority uyumu PASS. Provider çağrısı yapılmadı.

- NET deployment: `xit7ibwa3x9f8fv2bh1jt1z7`, finished.
- SITE deployment: `bvav4q6akw3dwu8zjgawxrnz`, finished.
- Global kuyruk boş; yalnızca incelenmiş kaynak/SOURCE_COMMIT pinleri uygulandı. Auto/preview kapalı; diğer yapılandırma ve preview satırları korunuyor.
- İki hedefin gerçek image ve health'i, SOURCE_COMMIT, altı dosyalık manifest, resmi generated artifact, mevcut approval profili ve SITE veritabanı authority uyumu PASS. Son doğrulama read-only; provider çağrısı yapılmadı.
- Canlı CUA: 1280×720 masaüstü, 390×844 ve 320×740 mobil. Header mevcut, masaüstü galeri/header yüksekliği ekranla uyumlu. Tek görünür sepet kısayolu. Canlı sepet aç/kapat, mobil menü Escape, mobil arama ve beden penceresi Escape PASS. Mobil satın alma barı alt menünün tam üzerinde; yatay taşma yok.
- Geçici viewport sıfırlandı; canlı ürün sekmesi kullanıcıya bırakıldı.

İzole proof ve sanitised son runtime sonucu: `/tmp/siora-pdp-header-release-4793ef08eedb4da17f6c7df0920a538a4dc88504/`.

Canlı ürün: https://butik-siora.saas-staging.celebix.net/urun/lunea-noir-denim-crop-ceket-pantolon

## Canlı görünüm kanıtları

- [Masaüstü](product-header-desktop-live.jpg)
- [Mobil](product-header-mobile-live.jpg)
