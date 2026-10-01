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

## Canlı yayın

Kaynak `4611b9bd5dc32d336ccbd102ac173f8dccaf2bdb`, güncel ortak baseline `370f340bfa87822357fce8746ca4c8c2c77ecd7a` korunarak iki hedefte yayımlandı. Header dışındaki ödeme/runtime ve adapter/generator kaynakları baseline ile aynıdır. İncelenmiş NET→SITE release helper, özel snapshot, global kuyruk kilidi ve tek seferlik owned receipt sırası kullanıldı.

- NET deployment: `r14gbswywq3c4c6ivnz6w72k`, finished.
- SITE deployment: `y9zdrlumcex4gua1e1q1zwkg`, finished.
- Global aktif deployment sayısı: 0; yapılandırma karşılaştırması PASS.
- İki gerçek image/SOURCE_COMMIT, kaynak manifesti, resmi generated artifact, mevcut approval profilleri ve SITE veritabanı authority uyumu PASS. Doğrulama read-only; provider çağrısı yapılmadı.
- Canlı CUA kontrolü: 1280×720 masaüstü, 390×844 ve 320×740 mobil. Aşağı kaydırma compact/inert, yukarı kaydırma tam header, kırpılmış masaüstü arama, sepet açma/kapatma, mobil menü Escape ve mobil arama geçti. Dar mobilde belge genişliği viewport ile aynı ve sabit alt menü ekranın alt kenarında.
- Canlı denim ürün sayfasında normal header sayısı 0; onaylanan immersive yerleşim korunuyor. Son tarayıcı önizlemesi mağaza ana sayfasında bırakıldı; geçici viewport sıfırlandı.

Release proof ve sanitised runtime sonucu `/tmp/siora-header-release-4611b9bd5dc32d336ccbd102ac173f8dccaf2bdb/` içinde tutulur. Canlı adres: https://butik-siora.saas-staging.celebix.net/

## Canlı görünüm kanıtları

- [Masaüstü](header-desktop-live.jpg)
- [Kaydırılmış menü](header-compact-live.jpg)
- [Mobil](header-mobile-live.jpg)

Kaynak önizleme görüntüleri aynı klasörde `header-*-preview.jpg` olarak korunur.
