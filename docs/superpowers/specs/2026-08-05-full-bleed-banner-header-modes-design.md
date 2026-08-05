# Tam Genişlik Banner ve Header Modları — Tasarım

**Durum:** Kullanıcı tarafından yazılı olarak onaylandı  
**Tarih:** 2026-08-05  
**Hedef:** Yüklenen, kendi metin ve görsel kompozisyonunu zaten içeren banner'ı storefront'ta bölmeden göstermek ve mevcut tema ayarındaki header stilini canlı vitrine uygulamak.

## Sorun

Ortak storefront renderer, görsel içeren her banner'ı iki kolona bölüyor. Sol kolonda mağaza adı, başlık, açıklama ve çağrı düğmesi yeniden üretilirken sağ kolonda yüklenen görsel gösteriliyor. Tasarlanmış banner görselinin kendi kompozisyonu bulunduğu için bu davranış görseli daraltıyor, içeriği tekrar ediyor ve kullanıcının yüklediği tasarımı bozuyor.

Tema kompozisyonunda `visual.headerStyle` alanı zaten strict `overlay | solid` enum'u olarak saklanıyor ve admin panelinde seçilebiliyor. Ancak ortak storefront renderer bu otoriteyi okumuyor; header her zaman banner'ın dışında düz zemin üzerinde gösteriliyor. Admin önizlemesi de seçimi yansıtmıyor.

## Karar

Yeni sözleşme, migration veya bağımsız ayar kaynağı oluşturulmayacak. Tek otorite mevcut yayınlanmış tema belgesindeki:

```ts
composition.visual.headerStyle: "overlay" | "solid"
```

olacaktır.

Görsel içeren aktif banner:

- tek parça ve tam genişlikte gösterilir;
- yapay sol metin paneli oluşturmaz;
- görselin tamamını korur, kırpmaz ve en-boy oranını bozmaz;
- mobil görsel varsa küçük ekranlarda onu, yoksa masaüstü görselini kullanır;
- slider okları, noktaları, duraklatma ve reduced-motion davranışını korur.

Görsel içermeyen geriye uyumlu banner, mağazanın boş/legacy kalmaması için mevcut güvenli metinli fallback'i kullanır.

## Header Davranışı

### Banner üzerinde

`headerStyle === "overlay"` ve görünür banner görseli bulunduğunda header, hero alanının üst kısmında şeffaf bir katman olarak yer alır. Navigasyon banner'ın üzerine gelir; yüksek z-index, kontrollü kontrast ve metin gölgesi ile okunabilir kalır. Header banner görselini daraltmaz veya aşağı itmez.

### Düz zemin

`headerStyle === "solid"` olduğunda header mevcut normal document-flow satırında, tema arka planı üzerinde gösterilir. Banner header'ın altında tam genişlikte başlar. Bu mod sticky veya browser'a sabitlenmiş bir header oluşturmaz; seçenek yalnız banner üzerine bindirme ile ayrı düz zemin arasındaki yerleşim farkını yönetir.

### Fail-closed fallback

Overlay seçilmiş olsa bile görünür bir banner görseli yoksa header düz zemin moduna düşer. Böylece navigasyon, metinli fallback üzerinde bilinmeyen kontrastla kaybolmaz. İç sayfalarda ve `showHomeSurfaces=false` kullanımlarında header daima düz zemin olarak kalır.

## Admin Deneyimi

Mevcut header seçimi korunur ve daha açık etiketlenir:

- `Banner üzerinde (şeffaf)`
- `Banner dışında (düz zemin)`

Tema önizlemesi seçilen modu anında yansıtır. Banner görseli olan önizlemede yapay iki kolon kaldırılır; görsel alan tam genişlikte temsil edilir. Kayıt ve yayınlama mevcut unified storefront theme authority üzerinden devam eder.

## Bileşen Sınırları

- `StorefrontDesignRenderer` yayınlanmış `composition.visual.headerStyle` değerini okur, etkili header modunu fail-closed hesaplar ve header/hero yerleşimini ortak bir hero shell içinde render eder.
- `storefront-design.css` tam genişlik görseli, overlay header katmanını, solid header akışını ve responsive davranışı uygular.
- `StarterThemeComposer` yalnız mevcut strict enum'un anlaşılır etiketlerini sunar.
- `StarterThemePreview` aynı enum'a göre overlay/solid yerleşimi gösterir; ikinci bir ayar veya browser authority üretmez.

## Güvenlik ve Veri Yetkisi

- Header modu yalnız yayınlanmış tenant-bound tema belgesinden gelir.
- Browser header, query, cookie, hostname veya local state kalıcı otorite değildir.
- Media URL'leri mevcut public storefront projection tarafından çözümlenir; media ID veya store ID renderer'a sızdırılmaz.
- Banner metni HTML olarak yorumlanmaz ve unsafe HTML yolu eklenmez.
- Overlay seçimi başka mağazanın medya, tema veya tasarım verisine erişim sağlamaz.

## Test Stratejisi

Önce başarısız testler eklenecek ve ardından en küçük uygulama yapılacaktır.

- Görselli banner yalnız `<picture>` yüzeyini render eder; copy paneli render etmez.
- Desktop ve mobile source URL'leri değişmeden korunur.
- Görselli hero tam genişliktir; eski split-grid seçicisi bulunmaz ve görsel kırpılmaz.
- Overlay modu görselli ana sayfada header'ı banner shell içine alır.
- Solid modu header'ı normal akışta tutar.
- Overlay + görselsiz hero ve iç sayfa kullanımı solid fallback üretir.
- Admin composer iki doğru etiketi gösterir ve mevcut enum dışında değer üretmez.
- Admin önizlemesi iki modu ayırt eder.
- Slider navigation, reduced-motion, logo, promotion ve unified publish testleri gerilemez.
- Customer-panel ve storefront workspace test/typecheck/build doğrulamaları geçer.

## Yayınlama

Uygulama ve yerel doğrulama tamamlandıktan sonra değişiklikler normal commit/push akışıyla gönderilir. Yalnız Güzide customer-panel staging ve Güzide storefront staging, exact yeni SHA ile hedefli olarak deploy edilir ve masaüstü/mobil görsel doğrulama yapılır. Production deploy, production mutation, migration ve başka uygulama deploy'u yapılmaz.

## Kapsam Dışı

- Sticky-on-scroll header;
- yeni header enum değerleri;
- banner üzerine ayrı metin/CTA katmanı editörü;
- banner görselini otomatik yeniden tasarlama veya kırpma;
- tema sözleşmesi ya da PostgreSQL migration değişikliği;
- production deploy.
