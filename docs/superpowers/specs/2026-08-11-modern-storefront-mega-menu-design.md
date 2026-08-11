# Modern storefront mega menü tasarımı

## Amaç

Starter storefront masaüstü kategori dropdown’unu mevcut uzun, tek sütunlu ve boş alan üreten görünümden; kompakt, modern, klavye erişilebilir ve kategori sayısına uyum sağlayan bir mega menüye dönüştürmek.

## Kapsam

- `CampaignHeader` içindeki masaüstü kategori dropdown yapısı ve stilleri güncellenir.
- Kategori veya öne çıkan görsel otoritesi değiştirilmez; yalnız mevcut `presentation.navigation` verisi render edilir.
- Mobil drawer, route’lar, sözleşmeler, veritabanı, admin tasarım ayarları ve storefront yayınlama akışı değiştirilmez.

## Tasarım

- Dropdown, header altında ortalanmış ve ekran genişliğiyle sınırlandırılmış beyaz bir yüzey olur.
- Öne çıkan kategori görseli bulunmadığında alt kategoriler tam genişliği kullanan üç sütunlu kompakt bir listeye yayılır.
- Öne çıkan görsel bulunduğunda liste alanı ve sağdaki görsel kart dengeli iki ana sütun oluşturur; liste kendi içinde iki sütuna iner.
- Kategori başlığı liste alanının tamamını kaplar. Her alt kategori bağlantısı en az `48px` yüksekliğe sahiptir.
- Bağlantılar kalın ayırıcı çizgiler yerine hafif yüzey vurgusu, ince başlangıç çizgisi ve küçük yatay hareketle geri bildirim verir.
- Yüzeyde ölçülü border, gölge ve köşe yumuşatma kullanılır; iç içe kart görünümü oluşturulmaz.
- Uzun listeler viewport’u taşırmaz; içerik kontrollü biçimde kendi içinde kayar.
- Hover ve `focus-within` açılma davranışı korunur. Klavye odağı görünür olur ve reduced-motion tercihinde hareket yaklaşık `0.01ms` olur.

## Responsive davranış

- Masaüstü mega menü yalnız `1025px` ve üzerinde görünür.
- `1024px` ve altında mevcut mobil drawer değişmeden kalır.
- Masaüstü yüzey genişliği küçük ekranlarda güvenli yatay gutter bırakır.

## Testler

- Failing test önce üç sütunlu görselsiz düzeni, iki sütunlu görselli düzeni, `48px` hedefleri, viewport sınırını ve reduced-motion davranışını ister.
- Minimal component/CSS değişikliği testi yeşile çevirir.
- Focus/hover açılma, tam kategori slug’ları ve mobil drawer regresyonları çalıştırılır.
- Storefront workspace test, typecheck ve production build doğrulanır.
- Canlı staging’de görselsiz ve görselli dropdown durumları masaüstünde, mobil drawer ise dar viewport’ta görsel olarak incelenir.

## Kabul kriterleri

- Dropdown’da kullanılmayan büyük beyaz alan kalmaz.
- Alt kategoriler okunabilir ve dengeli sütunlarda görünür.
- Her bağlantı fare ve klavye ile erişilebilir; minimum hedef alanı korunur.
- Öne çıkan görselin bulunup bulunmaması yerleşimi bozmaz.
- Mobil navigasyon davranışı değişmez.
