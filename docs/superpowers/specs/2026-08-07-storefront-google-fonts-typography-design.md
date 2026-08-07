# Storefront Google Fonts Typography Design

Status: Kullanıcı tarafından 2026-08-07 tarihinde yazılı olarak onaylandı.

## Amaç

Mağaza yöneticisi **Tasarım → Yazı** alanından başlık ve normal metin tipografisini birbirinden bağımsız seçebilmeli; font ailesi, ağırlık ve piksel boyutu aynı sürümlü tasarım taslağına kaydolmalı ve yalnız yayınlandıktan sonra ilgili storefront'a uygulanmalıdır. Katalog Google Fonts kapsamını sunarken storefront yalnız seçilen aile ve ağırlıkları yüklemelidir.

## Kullanıcı deneyimi

Yazı paneli iki belirgin karttan oluşur:

- **Başlıklar:** aranabilir Google font seçici, seçilen fontla canlı örnek, ağırlık ve `24–72 px` boyut kontrolü.
- **Normal metinler:** bağımsız aranabilir Google font seçici, paragraf örneği, ağırlık ve `14–20 px` boyut kontrolü.

Arama en az iki karakterden sonra katalog üzerinde filtreleme yapar. Seçili font her zaman sonuçlarda görünür. Kontroller en az 48 px etkileşim alanına, görünür label'a, klavye odağına ve hata durumunda sabit geri bildirime sahip olur. Preview değişiklikleri anında gösterir; storefront yalnız yayınlanan projection'ı kullanır.

## Sözleşme ve geriye uyumluluk

Tasarım dokümanına sınırlandırılmış bir tipografi nesnesi eklenir:

```ts
type StorefrontTypography = Readonly<{
  headingFont: StoreTypographyFontOption;
  bodyFont: StoreTypographyFontOption;
  headingWeight: "400" | "500" | "600" | "700" | "800";
  bodyWeight: "400" | "500" | "600" | "700" | "800";
  headingSizePx: number;
  bodySizePx: number;
}>;
```

Font seçenekleri yalnız `family`, sınırlı `category`, desteklenen `availableWeights` ve sabit `source: "google"` alanlarını taşır. Keyfi CSS, stylesheet URL'si veya HTML saklanmaz. Başlık boyutu `24–72`, gövde boyutu `14–20` aralığı dışında kabul edilmez. Mevcut `brand.fontFamily` kayıtları geriye uyumluluk için sırasıyla güvenli başlık/gövde varsayılanlarına normalize edilir; eski yayınlar görünüm veya parse hatası yaşamaz.

Draft, preview ve public publication projection aynı normalize edilmiş tipografi sözleşmesini kullanır. Tenant/store kimliği yalnız mevcut PostgreSQL repository ve TenantContext otoritesinden gelir; browser girdisi mağaza seçemez.

## Google Fonts kataloğu

Customer-panel için sunucu taraflı, salt-okunur bir katalog endpoint'i Google Fonts metadata kaynağını çağırır. Yanıt 24 saat cache edilir ve yalnız normalize edilmiş font ailelerini, kategorileri ve izin verilen ağırlıkları döndürür. Uzak kaynak başarısızsa mevcut seçilmiş güvenli katalog dönülür; tasarım ekranı kullanılabilir kalır.

Katalog yanıtı kontrol karakterlerini, boş aileleri, desteklenmeyen kategorileri ve izin dışı ağırlıkları eler. Tarayıcı Google metadata kaynağına doğrudan erişmez ve herhangi bir API anahtarı almaz.

## Storefront yükleme ve performans

Storefront, yayınlanan tipografiden kullanılan fontları aile adına göre tekilleştirir ve yalnız seçilen iki ağırlığı içeren tek bir `fonts.googleapis.com/css2` URL'si üretir. Aynı aile başlık ve gövdede kullanılıyorsa tek aile isteği oluşur. Stylesheet `display=swap` kullanır; Google CSS ve font origin'leri için sınırlı preconnect uygulanır.

Fontlar yüklenmeden önce kategoriye uygun sistem fontu fallback olarak render edilir. Katalog verisi veya seçili font geçersizse uygulama güvenli varsayılanlara döner. Font metadata'sı client bundle'a topluca gömülmez; arama sonuçları endpoint'ten yüklenir. Storefront'a tam katalog, API anahtarı veya mağaza otoritesi taşınmaz.

CSS değişkenleri aşağıdaki yüzeye bağlanır:

```text
--store-font-heading
--store-font-body
--store-font-heading-weight
--store-font-body-weight
--store-font-heading-size
--store-font-body-size
```

Başlık değişkeni vitrin section başlıkları, ürün başlıkları ve içerik başlıklarına; gövde değişkeni navigasyon dışındaki normal metin, açıklama ve form metinlerine uygulanır. Mevcut erişilebilir minimumlar ve responsive sınırlar korunur; mobilde başlık boyutu güvenli bir `clamp()` üst sınırıyla viewport dışına taşmaz.

## Hata davranışı

- Google metadata erişilemezse panel güvenli featured katalogla çalışır.
- Seçili font katalogda artık bulunamıyorsa kaydedilmiş normalize değer ve fallback stack korunur.
- Desteklenmeyen ağırlık en yakın güvenli desteklenen ağırlığa değil, tanımlı rol varsayılanına düşer; sessiz farklı görünüm üretilmez.
- Boyut veya font sözleşmesi bozuksa kayıt/publish isteği kontrollü validation hatası verir.
- Font stylesheet'i yüklenemezse sayfa sistem fontuyla kullanılabilir kalır; içerik veya navigasyon bloke olmaz.

## Testler

- Sözleşme testleri başlık/gövde fontlarını, ağırlıkları ve kesin piksel sınırlarını kabul/reddetmeyi kanıtlar.
- Legacy testleri dört eski `brand.fontFamily` değerinin güvenli tipografi varsayılanlarına dönüştüğünü kanıtlar.
- Katalog endpoint testleri cache header'ını, metadata normalizasyonunu ve featured fallback'i doğrular.
- Admin bileşen testleri iki bağımsız font seçici, ağırlık/boyut kontrolleri, 48 px hedefler ve canlı preview değişkenlerini doğrular.
- Projection testleri taslak/yayın ayrımını ve mağaza izolasyonunu korur.
- Storefront testleri yalnız kullanılan aile/ağırlıkların tek URL'de üretildiğini, aynı ailenin tekilleştirildiğini, `display=swap` ve fallback stack'i doğrular.
- Responsive testler `320`, `390`, `1024` ve `1025` genişliklerinde taşma olmadığını; başlık ve gövde boyutlarının yayınlanan ayara uyduğunu doğrular.
- Customer-panel ve storefront test/typecheck/build regresyonları çalıştırılır; secret ve keyfi CSS/URL taraması temiz kalır.

## Dağıtım sınırı

Kod commit ve push edildikten sonra yalnız Güzide staging customer-panel ve storefront servisleri hedeflenebilir. Production, Owner, apps/admin, migration dışı altyapı ve başka mağazalar bu teslimatın kapsamı dışındadır. Canlı yayınlama ayrıca uygulama tamamlandıktan sonra mevcut staging yetkisiyle doğrulanır.
