# Mağaza satışı HTML demosu

**Tarih:** 2026-09-26

**Amaç:** Kasiyer ekranını ürün uygulaması öncesinde görsel ve etkileşimli incelemek.

Demo: [in-store-register-demo.html](in-store-register-demo.html). Tek dosyadır; doğrudan tarayıcıda açılabilir. Harici kütüphane, font veya ürün görseli gerektirmez. Gerçek satış, banka POS'u, sipariş ve stok servislerine çağrı yapmaz.

## Deneme

- Başlangıç: Klasik Blazer + Basic Tişört, toplam **₺2.000**.
- Örnek ürün kartına dokunmak barkod okutmayı canlandırır. Arama alanına `9900000000011` veya `9800000000021` yazıp Enter ile de eklenebilir.
- Aynı barkod tekrar okutulunca adet artar. Ürün adı ve SKU ile de arama yapılır.
- `%10` indirim → **₺1.800**. `₺150` indirim → **₺1.850**.
- `Beklet` ile yeni sepet açılır. Başka bir sepet açılırken mevcut sepet otomatik bekletilir.
- `Ödemeye geç` sonrasında sepet/indirim sabittir. `Ödemeyi aldım — Satışı tamamla` yalnız demo kaydı oluşturur.
- `Demo seçenekleri` içindeki bağlantı kesintisi örneği, ödeme beyanı sonrası aynı satışın yeniden kaydedilmesini gösterir.
- `Son satışlar` örnek kayıtları ve indirim/net toplamlarını gösterir. `Demoyu baştan başlat` tüm demo verilerini temizler.

## Saklama ve sınır

Örnek sepet, bekletilenler ve satışlar bu tarayıcının yerel depolamasında tutulur. Tarayıcı depolaması kullanılamıyorsa demo mevcut sayfada çalışır; yenilemede kurtarma garantisi yoktur. Gerçek üründe kalıcı sunucu kaydı, ortak stok rezervasyonu, yetkilendirme, fiyat doğrulaması ve denetim kayıtları ayrıca uygulanacaktır. Bu HTML üretim uygulaması olarak kullanılmaz.

## Doğrulama kaydı

Tarayıcı üzerinde kontrol edildi:

- 1440 / 1024 / 390 px: sayfa yatay taşması **0**; ekran görüntüleri incelendi.
- %10 ve ₺150 indirim sonuçları; toplamı aşan indirimin reddi; tür değişiminde boş alanın Enter ile yanlış uygulanmaması.
- Mobil sabit ödeme çubuğundan indirim erişimi; fare ve klavyeyle adet artırma/azaltma.
- Enter barkod ekleme; sepet bekletme; açık sepetin başka bekletilene geçişte korunması.
- Ödeme aşamasında barkod/sepet/indirim kilidi.
- Bağlantı kesintisi → sayfa yenileme → aynı `MS-0101` satışını tekrar kaydetme; çift tıklamaya rağmen **bir** satış, ₺200 indirim, ₺1.800 net.
- Yeni satışta boş sepet, başlangıç odağı; demo sıfırlamada temiz ₺2.000 örnek sepet.
- Tarayıcı konsolunda kontrol sırasında uygulama hatası gözlenmedi.

Bağımsız kaynak incelemesinde bulunan boş indirim Enter kontrolü, kompakt menü etiketleri ve adet değiştirme odağı düzeltildi. Görsel kontrolde mobil satır tutarının `+` düğmesini örtmesi giderildi. 1024 px'de birim fiyat varyant satırında korunur.
