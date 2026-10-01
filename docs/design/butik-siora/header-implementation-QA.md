# Siora header — iki sıra tasarım

2 Ekim 2026. Hermès referansındaki ince arama alanı, ortalı marka ve sağ hesap/sepet yerleşimi Siora temasına uygulandı. Alt sıra merkezde menüyü taşır. Aşağı kaydırınca yalnızca menü sırası kalır; yukarı kaydırma veya menüye klavye odağı tam başlığı geri getirir. Görünmeyen üst sıra `inert` olur. Sticky üst konumu değişir; sayfa yüksekliği ve mobil sabit alt menüsü değişmez.

Güncel anonim public veriler tasarım v6 ve gerçek Siora logosuyla doğrulandı. Admin navigation.items boş: Ana Sayfa ve Tüm Ürünler mevcut bağlantıları korunur. Sonradan yayımlanan kategori/koleksiyon ağaçları mevcut ortak renderer üzerinden aynı sıralama, hedef, alt dal ve featured görsellerle gösterilir. Yalnızca Siora tema dosyaları değişti; admin/API/veri şeması ve Alpler mobil shell değiştirilmedi. Contained genişlik ve overlay/solid zemin ayarları sürer; Siora'nın header yerleşimi istenen iki sıra görünümüdür.

Arama gerçek GET formudur; JS açıkken kırpılmış ve URL kodlanmış metin mevcut /search rotasına yönlenir. Sepet aynı CartStatusProvider ve drawer üzerinden açılır. Hesap /account bağlantısını korur; favoriler kartlar, mobil menü ve footer üzerinden erişilebilir. Açılır kategoriler native details/summary kullanır; Escape, dışarı tıklama ve aynı anda tek panel davranışı eklenmiştir. Mobil genişliğe geçince desktop menüsü kapanır ve mobil dialog'un Escape davranışı etkilenmez.

## Doğrulama

- Header davranış testleri: 9/9; arama, form doğrulaması, cart provider, scroll/focus/inert, dışarı tıklama/Escape, tek açık disclosure, mobil breakpoint regresyonu.
- Storefront-shared tip kontrolü ve production build başarılı.
- Tam test paketi: 764/764 başarılı (718 server + 46 browser), başarısız veya atlanan test yok.
- CUA tarayıcı kontrolü: 1280×720 masaüstü, 390×844 ve 320×740 mobil. Arama ve sepet açılışı geçti; mobil belge genişliği viewport ile aynı, alt menü ekranın alt kenarında kaldı.
- Onaylanan immersive ürün sayfası ve ortak checkout'ın kendi header koşulları korundu; denim ürün rotasında normal Siora header sayısı 0.
- Ayrı incelemede bulunan desktop→mobile Escape hatası düzeltildi ve regresyon testi geçti.

## Yayın durumu

Bu çalışma henüz canlıya yayımlanmadı. Ortak storefront üzerinde devam eden gerçek ödeme kabul testi boyunca source pin/env/deployment değiştirilmedi. Read-only yayın kontrolünde iki hedefin b73fc743 kaynağında ve kuyruğun boş olduğu doğrulandı. Çalışma branch'i 9c840923 merge commit'i ile mevcut PayTR hotfix branch'inin 370f340b kaynağını içerir; tasarım yeni backend düzeltmelerini geri almaz. Yayın öncesinde güncel ortak baseline, release lock ve ödeme kabul durumu tekrar doğrulanmalıdır.

## Önizleme kanıtları

- [Masaüstü](header-desktop-preview.jpg)
- [Kaydırılmış menü](header-compact-preview.jpg)
- [Mobil](header-mobile-preview.jpg)
- Çalışan kaynak önizlemesi: http://127.0.0.1:3319/fixture/empty?tenant=siora&returnTo=%2F
