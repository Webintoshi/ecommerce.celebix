# Güzide mobil tarayıcı deneyimi — 2 Ekim 2026

Kullanıcı üç ekranlı görseli onayladı ve doğrudan kodlama istedi. Kapsam browser-only mobil kullanım; kurulum, PWA, bildirim veya servis worker ürün koduna eklenmedi. Değişiklik yalnız exact Güzide theme guard'ı ile etkinleşir. Ortak ödeme, ürün, stok, fiyat, kategori, favori, SEO ve admin sözleşmeleri korunur; yeni paket bağımlılığı eklenmedi.

## Uygulanan davranış

-  Root layout içinde Güzide çerçevesi, sepet ve favori provider'ları korunur. Alt gezinme Ana Sayfa · Keşfet · Favoriler · Sepet'tir. Keşfet mevcut onaylı tam ekran menüyü açar.
-  Ürün ekranında sekmeler gösterilmez; mevcut satın alma şeridi kalır. Arama ve hesap ekranlarında alt gezinme gizlenir. Checkout sonuçları eski normal header/footer'ı, exact checkout ödeme chrome'unu kullanır; auth ve quick order kendi bağımsız main'ini korur.
-  Menüde Back önce alt kategoriden ana menüye döner, ardından menüyü kapatır. X ve bağlantılar sahip olunan history entry'sini tüketir. Sepete gelen geç add yanıtı varsa açık menü tüketildikten sonra sepet açılır; ikinci open isteği beklemeyi atlayamaz.
-  Host/tenant/history entry bazlı konum kaydı ile ürün dönüşünde filtreli URL ve konum korunur. Direkt ürün girişinde gerçek admin kategori bağlantısı kullanılır. Eski ödeme dönüş token'ı tekrar kullanılamaz.
-  Gerçek admin kategori adları ve sırası korunur. Katalog yalnız desteklenen stok/indirim filtresini ve fiyat/isim sırasını kullanır. Güzide kategori sayfası gerçek24 offset/total sorgusunu, search gerçek48 cursor sözleşmesini kullanır. Diğer tenant category limit48 davranışı korunur.
-  Checkout sınırında server cart yeniden çözülür; replaceCart sonrası geç eski resolve yeni sepeti ezemez. Hesap sayfaları ikinci Cart/Favorite provider kurmaz.

## Görsel sadakat ve metin kontrolü

Onaylı PNG, son home/catalog/product screenshot'ları aynı görsel inceleme geçişinde açıldı.

| Referans | Son uygulama ve karar |
| --- | --- |
| Kompakt logo + search/account/menu | Gerçek admin logosu,72px mobil header; desktop eski düzen. Canlı font tanımları değişmedi. Body Bai Jamjuree ve mevcut PDP title Arial kuralı aynen korunur. |
| Mevcut sıcak takı kolajı ve az boşluk | Kolaj aynı; ilk ürün rail'i öncesi fazla boşluk azaltıldı. Yeni slogan/kampanya veya yapay ürün fotoğrafı yok. |
| Dört sabit alt sekme | 68px + safe area; dört eşit dokunma alanı, koyu aktif etiket; mevcut ince çizgi ikonları. Overlay sırasında bar DOM'da kalıp inert/gizli olur, tetikleyici odak dönüşü korunur. |
| İki sütunlu kategori ve Filtrele/Sırala | 390 ve320'de iki sütun; gerçek tam admin adları ('Taşlı Kolyeler') mock'un kısaltılmış metnini alır. Filtre/sıralama native details; Escape/outside/apply focus dönüşü. |
| Tek ürün geri satırı ve gallery | Tek bağlamsal geri satırı; onaylı mevcut iki görsel/galeri/title/fiyat/CTA kuralları korunur. Sekmeler ile satın alma şeridi yığılmaz. |
| Ödeme/form klavye kullanımı | Checkout/search/account'ta bottom nav yok;390×480 dar yükseklikte odaklı input üzeri kapanmıyor. |

Copy diff: Ana Sayfa, Keşfet, Favoriler, Sepet, Filtrele, Sırala onayla aynı. Ürünler, fiyatlar ve kategori adları canlı/admin kaynaklarından gelir; mock örnek fiyatları sabitlenmedi. 'Kolyelere dön' kaynağa göre 'Ana sayfaya dön' veya 'Arama sonuçlarına dön' olur. Yeni indirme/uygulama/bildirim kampanya metni yok.

## Tarayıcı doğrulaması

Yerel fixture gerçek shared React bileşenlerini ve mevcut Güzide verilerini kullanır; fixture fiyat/stok otoritesi canlı veritabanı kanıtı değildir. Fixture asset worker'ı yalnız eski yerel QA yardımcı dosyasıdır, ürün source/build'ine eklenmez.

- 390×844: tek main/header; alt bar viewport tabanında68px; yatay taşma0. Home → Keşfet → Kolyeler → Back ana menü → Back kapanış; focus gerçek Keşfet düğmesine döndü, body lock kalktı.
- 320×640: yatay taşma0, grid135px+135px; sekme hedefleri76×59px; menü ve kapanış kullanılabilir.
- Kolyeler sort=price-asc fiyatları gerçekten artan sırada; Keşfet aktif. Görünen ürün 729 açıldı ve bağlamsal Back ile aynı /kategori/kolyeler?sort=price-asc URL ve1080.5px konuma dönüldü.
- Sepet Back kapanışı focus 'Sepet,6 ürün' ve1080.5px konumu korudu. Ödemeye geç: tek main; nav yok, stale inert/scroll lock yok. Server quote tekrar çözüldü.
- Favori düğmesi1 gerçek doğrulanmış ürün sayacına ulaştı; sayfa geçişi sonrası sepet6 ve favori1 korunuyor.
- 1280×900: tek header/main, alt gezinme CSS display:none, yatay taşma0; eski desktop düzen korunur.
- Form inputları16px; ad/soyad ayrı, postalCode required, coupon alanı mevcut.390×480 odaklı email alanında alt navigasyon yok/taşma0. Fiziksel telefon ve gerçek IME testi yapılmadı.
- Yerel dev konsolunda uygulama error yok. Düzenleme sırasında dev Fast Refresh ve önceki smooth-scroll uyarısı görüldü; Güzide html data-scroll-behavior tanımı eklendi. Son production console kontrolü yayın sonrası kayda eklenecek.

## Kontrol sonuçları

Focused navigation/PDP18, cart history/gate7, root session4, catalog/data/routes15 ve search regresyonları geçti. Son storefront tam koşumu783 server +132 browser =915 test,0 hata; typecheck ve production build geçti. Final yayın kimlikleri yayın sonrası ayrı kayda yazılacak. Bağımsız code review: somut kalan hata yok; önceki SSR/account/focus/checkout/race bulguları giderildi.

## Görseller

-  docs/design/guzide-kuyumcu/mobile-app-experience-concept-2026-10-02.png
-  docs/design/guzide-kuyumcu/mobile-app-implemented-home-2026-10-02.png
-  docs/design/guzide-kuyumcu/mobile-app-implemented-catalog-2026-10-02.png
-  docs/design/guzide-kuyumcu/mobile-app-implemented-product-2026-10-02.png
-  docs/design/guzide-kuyumcu/mobile-app-implemented-desktop-2026-10-02.png

## Yayın koordinasyonu

Mira barkod yayını333c9b61 NET/SITE panel final verified sonrasında HOLD kalktı. Güncel mağaza baseline658fcdbf/658fcdbf, auto/preview deploy kapalı, global queue idle. Yayın korunan helper, taze payment proof, snapshot/prepare, NET strict verify, SITE final strict verify sırasını izler. Schema/admin/payment/provider/env değişikliği yok. Private kit içerikleri kayıt dışıdır.
