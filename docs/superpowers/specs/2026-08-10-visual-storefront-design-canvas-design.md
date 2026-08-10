# Görsel Storefront Tasarım Tuvali

**Tarih:** 2026-08-10
**Durum:** Kullanıcı tarafından yazılı olarak onaylandı

## Amaç

Customer-panel tasarım alanı, solda adım listesi ve sürekli açık dar form sütunları yerine mağazanın gerçek görünümünü merkez alan görsel bir düzenleyici olacaktır. Kullanıcı logo, duyuru, header, banner, kategori vitrini, ürün alanı, ürün sayfası, sepet ve footer gibi yüzeyleri tuval üzerinde seçer; yalnız seçilen yüzeyin mevcut güvenli ayarları sağ panelde açılır.

Bu değişiklik yeni bir tema authority'si oluşturmaz. Mevcut kalıcı taslak, otomatik kaydetme, sürüm kontrolü, yayınlama ve merchant-admin authority sınırları korunur.

## Seçilen yaklaşım

Gerçek `StorefrontDesignRenderer` temel alınacak ve çevresine yalnız customer-panel içinde çalışan bir seçim katmanı eklenecektir.

Alternatifler reddedildi:

- Ayrı bir sahte demo renderer'ı zamanla gerçek storefront'tan ayrışacağı için kullanılmayacak.
- Iframe, oturum ve origin karmaşıklığı yarattığı ve önceki mimari kararlarla çeliştiği için kullanılmayacak.
- Form alanlarını tuvalin üstünde küçük popover'lara dağıtmak erişilebilirliği ve karmaşık ayarların kullanımını bozacağı için kullanılmayacak.

## Genel yerleşim

Tasarım sayfası dört ana yüzeyden oluşur:

1. **Üst araç çubuğu:** kayıt durumu, masaüstü/mobil seçimi, paneli kapatma ve tek `Yayınla` eylemi.
2. **Tam genişlikte mağaza tuvali:** gerçek tasarım dokümanından üretilen storefront görünümü.
3. **Tuval seçim katmanı:** düzenlenebilir yüzeylerin erişilebilir tıklama hedefleri ve seçili alan çerçevesi.
4. **Sağ ayar paneli:** yalnız seçili yüzeyin mevcut editörünü gösteren 380–420 px genişliğinde çekmece.

Panel kapalıyken tuval kullanılabilir genişliğin tamamını alır. Panel açıldığında tuval küçülmez veya kırpılmaz; kullanılabilir alana sığacak biçimde ölçeklenir. Mobil customer-panel görünümünde sağ panel ekranın altından açılan tam ekran çekmeceye dönüşür.

Mevcut sürekli açık `Tüm site / Ana sayfa` kart şeridi, numaralı sol adım rayı ve ayrı inspector sütunu kaldırılır. Bunların içerdiği bütün adımlar tuval yüzeyleri ve kompakt bir “Alanlar” menüsü üzerinden erişilebilir kalır.

## Tuval etkileşim sözleşmesi

Her düzenlenebilir yüzey aşağıdaki ortak davranışı kullanır:

- Hover ve klavye odağında ince nötr çerçeve ve alan adı görünür.
- Tıklama veya `Enter`/`Space`, alanı seçer ve sağ paneli açar.
- Seçili alan turuncu çerçeve ve `Düzenleniyor` etiketi alır.
- Sağ panel kapatıldığında odak, alanı açan tuval kontrolüne geri döner.
- Tuval içindeki mağaza bağlantıları düzenleme modunda navigasyon yapmaz; aynı yüzeyin ayarını açar.
- Banner okları, viewport seçimi ve önizlemeye ait güvenli görsel kontroller çalışmaya devam eder.
- Tuval seçimi tenant, store veya kayıt kimliği taşımaz ve authority olarak kullanılmaz.

Klavye kullanıcıları aynı alanlara üst araç çubuğundaki `Alanlar` menüsüyle de erişebilir. Bu menü yalnız navigasyon kolaylığıdır; ikinci bir ayar kaynağı değildir.

## Yüzey eşlemesi

| Tuval yüzeyi | Açılan adım | Sağ panel içeriği |
| --- | --- | --- |
| Logo/mağaza adı | `brand` | Logo seçme/yükleme, logo boyutu, hizalama, favicon ve paylaşım görseli |
| Duyuru şeridi | `navigation` | Duyuru metni, ikon, hız, yön ve görünürlük |
| Header/menü | `navigation` | Header düzeni, genişlik ve menü seçenekleri |
| Renk veya yazı örneği | `style` | Başlık/gövde fontu, boyutlar ve mağaza renkleri |
| Ana banner | `hero` | Masaüstü/mobil görsel, sıra, hedef ve görünürlük |
| Kategori vitrini | `sections` | Tek yetkili kategori vitrini başlığı, düzeni, sırası ve kategori-görsel eşlemesi |
| Ürün bölümü | `sections` | Ana sayfa bölüm sırası, görünürlük ve ürün adedi |
| Promosyon alanı | `promotion` | Kampanya metni, hedefi, zamanı ve görünürlüğü |
| Ürün örneği | `product` | Galeri, miktar seçici ve satın alma alanı ayarları |
| Sepet simgesi/yan sepet örneği | `cart` | Yan sepet düzeni ve güven mesajları |
| Footer | `footer` | Bülten, mağaza bilgisi, bağlantılar ve alt alan görünümü |
| Medya kısayolu | `assets` | Banner ve kategori görselleri arşivi |

Logo yüzeyine tıklamak önce marka panelini açar. Panelin ilk birincil eylemi `Logo seç veya yükle` olur; dosya seçici gizli veya belirsiz bir alt alana gömülmez. Yeni görsel yalnız mevcut doğrulanmış upload akışından yüklenir ve draft'a seçilmeden storefront'ta görünmez.

## Gerçek içerik ve temsilî yüzeyler

Tuval, mümkün olan her yerde gerçek `StorefrontDesignRenderer` ve gerçek taslak değerlerini kullanır. Customer-panel çalışma alanında mağaza kataloğunun tam storefront sayfa verisi bulunmadığında ürün kartı, ürün detayı, sepet ve footer için sözleşmeye bağlı, açıkça `Önizleme` olarak işaretlenen nötr yüzeyler kullanılabilir.

Bu yüzeyler:

- sahte KPI, müşteri, sipariş veya fiyat üretmez;
- gerçek mağaza içeriğiymiş gibi sunulmaz;
- yalnız düzenin seçilebilir konumunu ve mevcut tema seçeneklerinin sonucunu gösterir;
- aynı composition sözleşmesinden beslenir;
- storefront runtime authority'si olarak kullanılamaz.

Kategori vitrini ayrı bir merchant-admin authority'sinden beslendiği için `CategoryShowcaseEditor` mevcut doğrulanmış API'sini korur. Tuval seçimi yalnız bu editörü sağ panelde açar; kategori ayarları tasarım dokümanına kopyalanmaz.

## Bileşen sınırları

### `DesignWorkspace`

- Taslak, otomatik kaydetme, publish ve sürüm çakışması state'inin tek sahibi olmaya devam eder.
- `selectedSurface`, `panelOpen` ve `previewMode` gibi yalnız arayüz state'ini yönetir.
- Alan seçimini mevcut `DesignWorkspaceLocation` değerine dönüştürür.

### `VisualStorefrontCanvas`

- Gerçek renderer'ı ve temsilî storefront yüzeylerini tek tuvalde birleştirir.
- Düzenlenebilir yüzeyleri sabit bir modelden render eder.
- Yalnız `onSelectSurface(surface)` callback'i üretir; API çağrısı veya persistence yapmaz.
- Masaüstü ve mobil ölçülerde aynı seçili yüzey sözleşmesini korur.

### `DesignSurfaceOverlay`

- Bir yüzeyin hover, focus ve selected görünümünü üretir.
- Semantik `button` davranışı, görünür etiket ve erişilebilir adı sağlar.
- İçerik layout'unu değiştirmez ve storefront bağlantılarını authority kabul etmez.

### `DesignSettingsDrawer`

- Seçili yüzeyin başlık/açıklamasını ve `DesignStepEditor` içeriğini gösterir.
- Masaüstünde sağ panel, dar ekranda tam ekran bottom sheet davranışı kullanır.
- `Escape`, kapat butonu ve backdrop ile kapanır; kirli veri sessizce kaybolmaz çünkü tasarım alanları mevcut otomatik kaydetme akışını kullanır.

### `DesignStepEditor`

- Mevcut güvenli editörleri yeniden kullanır.
- Tuval bağlamına uygun kısa başlıklar ve birincil eylem sırası sağlar.
- Aynı alan için ikinci state veya ikinci submit akışı oluşturmaz.

## Veri akışı

1. Server page mevcut `StorefrontDesignWorkspace` kaydını yükler.
2. `DesignWorkspace` aynı `StorefrontDesignDocument` ile canlı tuvali ve seçili editörü besler.
3. Tasarım alanındaki değişiklik `onChange` ile aynı immutable draft state'ine uygulanır.
4. Mevcut 700 ms autosave zinciri değişikliği sürüm kontrollü API'ye gönderir.
5. Tuval, local draft state'inden anında yeniden render olur.
6. `Yayınla`, son save tamamlandıktan sonra mevcut tek publish endpoint'ini çağırır.
7. Kategori vitrini ve medya arşivi kendi mevcut doğrulanmış API authority'lerini korur; tuval bunları birleştirmez veya browser state'ine kopyalamaz.

## Hata ve durum davranışı

- Preview parse edilemezse tüm ekran kaybolmaz; tuval içinde kontrollü `Önizleme hazır değil` durumu ve seçili editör erişimi korunur.
- Upload hatası sağ panelde alanın yanında gösterilir; son geçerli logo/banner değişmez.
- Autosave hatası üst araç çubuğunda görünür ve `Yayınla` devre dışı kalır.
- Sürüm çakışması mevcut fail-closed davranışı korur.
- Sağ panel kapanması bir save isteğini iptal etmez veya yeni bir save üretmez.
- Eksik kategori vitrini veya boş ana sayfa storefront'u çökertmez; ilgili yüzey tuvalde `Bu bölümü ekle` hedefi olarak gösterilebilir, gerçek storefront'ta sahte içerik üretilmez.

## Erişilebilirlik ve responsive ölçütleri

- Tüm tuval hedefleri semantik buton veya eşdeğer klavye davranışı sunar.
- Minimum etkileşim hedefi 48×48 px'dir.
- Seçim yalnız renkle anlatılmaz; etiket ve focus ring bulunur.
- Sağ panel `dialog`/`complementary` semantiği, erişilebilir başlık ve kapatma kontrolü taşır.
- Panel açıldığında ilk anlamlı kontrole odaklanır; kapanınca odağı çağıran yüzeye döndürür.
- `Escape`, backdrop ve kapat düğmesi çalışır.
- `prefers-reduced-motion` altında panel ve viewport geçişleri yaklaşık `0.01ms` olur.
- 320, 390, 768, 1024, 1025, 1280 ve 1440 px genişliklerde yatay taşma oluşmaz.

## Test kapsamı

### Model ve bileşen testleri

- Her tuval yüzeyinin tam olarak bir mevcut workspace adımına eşlendiği doğrulanır.
- Logo, header, banner, kategori, ürün, sepet ve footer seçiminin doğru sağ paneli açtığı kanıtlanır.
- Aynı alan için ikinci persistence veya submit authority'si oluşmadığı doğrulanır.
- Panel kapatıldığında odağın çağıran yüzeye döndüğü test edilir.
- `Escape`, backdrop ve kapat düğmesi test edilir.
- Logo yüzeyinden mevcut güvenli upload kontrolüne erişim doğrulanır.
- Kategori yüzeyinin yalnız `CategoryShowcaseEditor`'ı açtığı ve ayarları tasarım dokümanına kopyalamadığı doğrulanır.

### Güvenlik ve regresyon

- `localStorage`, `sessionStorage`, browser tenant/store header'ı, iframe ve `dangerouslySetInnerHTML` bulunmadığı taranır.
- Storefront bağlantılarının editörde navigasyon/authority olmadığı doğrulanır.
- Autosave sıra güvenliği, conflict ve tek publish davranışı mevcut testlerle korunur.
- Customer-panel test, typecheck ve build çalıştırılır.
- Storefront renderer ve storefront-shared regresyonları çalıştırılır.
- `git diff --check`, tracked secret scan ve değişen dosya kapsamı doğrulanır.

### Görsel kabul

- Masaüstünde panel kapalı ve açık durumlar 1440×900 ve 1280×800 ölçülerinde alınır.
- 1025 px masaüstü ve 1024 px mobil eşik davranışı doğrulanır.
- 390×844 ve 320×720 mobil tuval/panel durumları alınır.
- Logo, hero, kategori, ürün ve footer seçili durumları görsel olarak doğrulanır.
- Tuval ile gerçek renderer'ın renk, font, logo, banner ve navigation sonuçlarının aynı olduğu kanıtlanır.

## Kapsam dışı

- Yeni tema sözleşmesi veya migration;
- yeni storefront uygulaması;
- iframe veya reverse proxy;
- ürün, sipariş, müşteri veya session authority değişikliği;
- kategori vitrini verisini tasarım dokümanına taşımak;
- production deploy, production verisi veya credential değişikliği;
- bu çalışma sırasında staging deploy.

## Başarı ölçütü

Kullanıcı mağazasını ayrı form sütunlarında aramak yerine gerçek görsel tuval üzerinde düzenler. Logo dahil her temel tema yüzeyi doğrudan seçilebilir, doğru mevcut editörü sağ panelde açar ve değişiklik tuvalde anında görünür. Mevcut kalıcı authority, otomatik kaydetme ve tek yayınlama akışı değişmeden kalır.
