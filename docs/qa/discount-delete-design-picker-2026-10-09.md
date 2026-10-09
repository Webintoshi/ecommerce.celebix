# İndirim silme ve tasarım ürün seçimi

## Kapsam

- İndirim listesi ve ayrıntı ekranında arşivleme önadımı olmadan kalıcı silme.
- Aynı mağazada sunucu tarafından doğrulanan yetki, sürüm ve işlem anahtarı.
- Silme öncesi etkin popup/sepet yakalama bağlantıları ve devam eden ödeme kontrolü.
- Silinen indirimin canlı liste, ayrıntı, kupon, çoğaltma ve değişiklik uçlarından çıkarılması; sipariş/finans kanıtlarının korunması.
- Belirsiz silme sonucunu aynı işlemle doğrulama; sayfa yenilenince satır kaybolsa da kurtarma düğmesi.
- Ana sayfa ürün kaynağı değiştirilirken geçersiz kalan kategori kimliğinin temizlenmesi.

## Bulunan nedenler

İndirim sözleşmeleri ve arayüzünde yalnız arşivleme vardı. Kalıcı silme için ayrı sözleşme, makbuz ve geri döndürülemeyen silinme kaydı eklendi. Tarihi siparişlerin yabancı anahtarlarını kaldırmak veya mali kanıtları silmek çözüm olarak kullanılmadı.

Tasarımda kategori kaynağından manuel/yeni/indirimli ürün kaynağına geçerken `categoryId` kalıyordu. Ortak sıkı doğrulayıcı, yeni kaynak için geçersiz bu alanı reddediyordu. Kaynak değişiminde kaldırılıyor; seçili ürünler korunuyor.

## Doğrulama

- Tasarım: üç regresyon RED → GREEN; UI/önizleme 132/132, sunucu/API 34/34.
- İndirim arayüzü/client/API: kayıp yanıt, yanlış kayıt makbuzu, yetki, arşivden silme, etki engelleri, filtrelerin korunması ve liste dışı kurtarma dahil 93/93. İlgili sunucu ve tasarım API kontrolleri ayrıca 38/38.
- İndirim ayrıntısı: salt okunur ve arşivlenmiş kayıtta yetkili Sil; yetkisiz kullanıcıda gizli (3/3).
- Geniş panel komutunun ilk bölümü: 2357 test, 2295 geçti, 61 başarısız, 1 atlandı. Bu sonuç bütün panel testleri geçti anlamına gelmez. Başarısız 61 test adı, önceki `.tmp/order-bump-tools/panel-full.log` kaydıyla birebir eşleşir; yeni başarısızlık yok. İkinci sunucu bölümü ilk bölümün başarısızlığında çalışmadığından ilgili sunucu testleri ayrıca yürütüldü.

- Panel, sözleşme ve veri paketlerinin tip kontrolü geçti.
- Native 225: 24 dar okuyucu/yazıcı koruması; mevcut ödeme, settlement, iade ve stok fonksiyonları korunur. Testler izole veritabanında; gerçek mağaza verisine test kaydı yazılmaz.

## Yayın

Native kabul, geri alma provası, kaynak derlemesi ve iki ortak panelin gerçek çalışan kaynak doğrulaması tamamlanınca ayrı kabul makbuzu bu belgeye bağlanacaktır. Bu belge tek başına canlı yayın kanıtı değildir. Canlı mağazada test amacıyla mevcut indirim veya sipariş silinmez.
