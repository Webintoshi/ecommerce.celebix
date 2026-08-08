# Starter Storefront Typography Role Contract

**Tarih:** 2026-08-08  
**Durum:** Kullanıcı tarafından yazılı olarak onaylandı

## Amaç

Starter storefront içindeki bütün metin yüzeyleri tek ve açık bir tipografi rol sözleşmesine bağlanacaktır. Müşterinin **Tasarım → Yazı** alanında seçtiği başlık ve normal metin ailesi, ağırlığı ve piksel boyutu hem taslak önizlemede hem yayımlanan storefront'ta aynı sonucu üretmelidir. Bileşen içi sabit font aileleri veya bütün başlıkları tek boyuta zorlayan genel seçiciler bu otoriteyi ezmemelidir.

## Merkezi tipografi otoritesi

Mevcut sürümlü `StorefrontDesignTypography` nesnesi tek yazma ve yayınlama otoritesi olarak korunur:

- `headingFont`, `headingWeight`, `headingSizePx`
- `bodyFont`, `bodyWeight`, `bodySizePx`

Yeni veritabanı alanı, migration veya tarayıcıdan türetilen mağaza otoritesi eklenmez. `createStorefrontTypographyResources` yalnız doğrulanmış ve yayımlanmış değerlerden güvenli font kaynaklarını ve CSS değişkenlerini üretmeye devam eder.

## Rol sözleşmesi

### Başlık rolü

Aşağıdaki içerikler başlık font ailesi ve ağırlığını kullanır:

- ana sayfa hero ve kampanya başlıkları;
- sayfa `h1` başlıkları;
- bölüm `h2` başlıkları;
- kart ve alt bölüm `h3–h6` başlıkları;
- ürün adı, hızlı görünüm başlığı ve ilgili ürün bölümü;
- sepet, ödeme, hesap ve durum yüzeylerinin başlıkları;
- metinsel wordmark ve storefront marka başlığı;
- footer marka ve newsletter başlıkları;
- Markdown ürün açıklamasındaki `h1–h6` öğeleri.

Ürün ve kategori başlıkları yalnız HTML etiketine güvenilmeden, kullanıldıkları bütün ticaret yüzeylerinde açıkça sınıflandırılır:

| İçerik | Başlık ölçeği | Kapsanan yüzeyler |
| --- | --- | --- |
| Ürün detay adı | page | tekil ürün sayfası ve erişilebilir sayfa başlığı |
| Ürün kartı adı | card | ana sayfa ürün sıraları, ürün listesi, kategori listesi, arama, favoriler ve ilgili ürünler |
| Hızlı görünüm ürün adı | section | ürün quick-view dialog'u |
| Sepet ürün adı | compact | side cart, sepet sayfası ve checkout sipariş özeti |
| Sipariş ürün adı | compact | müşteri hesap sipariş listesi ve sipariş detayı |
| Kategori sayfa adı | page | kategori landing sayfası |
| Kategori bölüm başlığı | section | kategori vitrini ve kategori koleksiyonu bölümleri |
| Kategori kartı adı | card | ana sayfa kategori kutuları ve kategori görsel placeholder'ları |

Kategori adı menü bağlantısı veya breadcrumb içinde kullanıldığında içerik başlığı değil navigasyon/metaveri sayılır ve normal metin rolünü korur. Böylece aynı kategori adı bulunduğu yüzeyin semantik görevine göre doğru tipografi rolünü alır.

`headingSizePx` bütün başlıkları aynı piksel boyutuna zorlamaz. Bunun yerine merkezi ölçeğin temeli olur:

| Rol | Temel çarpan | Kullanım |
| --- | ---: | --- |
| display | 1.35 | hero ve büyük kampanya başlığı |
| page | 1.00 | sayfa başlığı |
| section | 0.72 | ana bölüm başlığı |
| card | 0.45 | ürün/kategori kartı başlığı |
| compact | 0.38 | drawer, özet ve yardımcı panel başlığı |

Her türetilmiş değer okunabilir bir alt sınırla korunur; viewport responsive küçültme yapabilir fakat admin değerini başka bir sabit font boyutuyla değiştiremez. Ürün detay başlığı mevcut dengeli tek satır davranışını korur ve başlık temelinden kontrollü bir katsayı kullanır.

### Normal metin rolü

Aşağıdaki içerikler normal metin font ailesi ve ağırlığını kullanır:

- paragraf, açıklama, liste ve Markdown gövdesi;
- navigasyon, buton ve bağlantı metinleri;
- form etiketi, input, select ve textarea;
- fiyat, SKU, stok, varyant, rozet ve breadcrumb;
- tablo, toplam, durum ve yardımcı metinler;
- footer bağlantıları ve politika gövdesi.

`bodySizePx` normal gövde boyutudur. Bilgi hiyerarşisi gereken yerlerde gövde tabanından sınırlı `lead`, `body`, `small` ve `meta` oranları türetilir. Fiyatlar ve butonlar yerel vurgu ağırlıklarını koruyabilir ancak font ailesi başlık rolüne kaçamaz.

### Etkilenmeyen içerikler

- yüklenen logo görselleri;
- SVG ikonlar ve dekoratif işaretler;
- erişilebilirlik için görsel olarak gizlenen metinlerin yerleşimi;
- ödeme iframe'inin üçüncü taraf içeriği.

## Uygulama sınırı

`StorefrontFrame` kökünde sürümlü bir tipografi sözleşmesi işareti ve merkezi ölçek değişkenleri bulunur. Storefront genel CSS'i semantik HTML ile açık rol sınıflarını birlikte kullanır. CSS module dosyalarındaki `Arial`, `Georgia`, `Times New Roman` veya başka sabit aileler merkezi otoriteyi eziyorsa güvenli değişkenlerle değiştirilir.

Başlık seviyeleri içerik hiyerarşisini belirtmeye devam eder; yalnız görsel boyut için yanlış HTML seviyesi kullanılmaz. Semantik olarak başlık olmayan `strong` öğeleri otomatik başlık rolü almaz. Başlık görevi gören `strong` veya `span` yüzeyleri açık bir tipografi rolüyle işaretlenir.

## Veri akışı

1. Müşteri başlık ve normal metin ayarlarını customer-panel'de değiştirir.
2. Mevcut taslak kaydetme ve yayınlama akışı doğrulanmış tipografi nesnesini PostgreSQL'e yazar.
3. Taslak önizleme ve public storefront aynı `createStorefrontTypographyResources` çıktısını kullanır.
4. Kök değişkenler tipografi ailesi, ağırlığı ve temel boyutlarını taşır.
5. Rol ölçeği bütün storefront yüzeylerinde deterministik türetilmiş değerleri uygular.

## Hata ve geriye uyumluluk

- Geçersiz font veya boyut mevcut fail-closed doğrulamadan geçemez.
- Eski yayınlar mevcut normalize edilmiş varsayılanlarla çalışır.
- Google Fonts kataloğu kullanılamazsa güvenli fallback aileleri korunur.
- Sözleşme uygulanmayan yeni bir storefront bileşeni testlerde rol kapsamı ihlali olarak yakalanır.
- Auth, checkout, tenant/store authority ve kalıcı veri davranışı değişmez.

## Test stratejisi

Test-first uygulama aşağıdaki davranışları kanıtlar:

1. Seçilen başlık ailesi/ağırlığı bütün başlık rollerine uygulanır.
2. Display, page, section, card ve compact başlıklar aynı piksel değeri yerine admin temelinden türetilmiş ölçeği kullanır.
3. Seçilen normal metin ailesi/ağırlığı gövde, kontrol ve metadata rollerine uygulanır.
4. Markdown başlıkları heading; paragraf ve listeleri body rolündedir.
5. Ürün adı, sepet, checkout, hesap, footer ve kampanya yüzeyleri doğru roldedir.
6. Ürün kartı adı; ana sayfa, ürün listesi, kategori listesi, arama, favoriler ve ilgili ürünlerde aynı `card` sözleşmesini kullanır.
7. Kategori sayfası, kategori bölümü, kategori kartı, menü ve breadcrumb aynı adı kendi semantik görevine göre doğru role bağlar.
8. Side cart, sepet, checkout ve sipariş özetindeki ürün adları `compact` başlık ölçeğini kullanır.
9. Logo görseli ve ikonlar tipografi değişiminden etkilenmez.
10. Starter storefront çalışma zamanı içinde merkezi otoriteyi ezen sabit font ailesi kalmaz.
11. Customer-panel taslak önizlemesi ile public storefront aynı rol ve ölçek çıktısını üretir.
12. Mevcut storefront, customer-panel typecheck/build ve commerce regresyonları geçer.

## Kapsam dışı

- Yeni font sağlayıcısı;
- yeni PostgreSQL migration veya sözleşme sürümü;
- her bileşen için ayrı admin tipografi alanı;
- production deploy veya credential değişikliği;
- starter tema dışındaki bağımsız donor uygulamalarının yeniden tasarlanması.

## Kabul kriterleri

- Admin panelindeki iki tipografi ayarı storefront'taki bütün ilgili yüzeyleri yönetir.
- Başlık ve gövde fontları birbirine karışmaz.
- Ürün ve kategori başlıkları liste, detay, arama, favori, sepet, checkout ve hesap yüzeylerinde açık bir role sahiptir.
- Boyut değişiklikleri okunabilir ve tutarlı bir hiyerarşi üretir.
- Sabit font sızıntısı testlerle engellenir.
- Önizleme ile yayımlanan storefront görsel olarak aynı tipografi kararını gösterir.
