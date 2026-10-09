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

Tasarımda kategori kaynağından manuel/yeni/indirimli ürün kaynağına geçerken `categoryId` kalıyordu. Ortak sıkı doğrulayıcı, yeni kaynak için geçersiz bu alanı reddediyordu. Kaynak değişiminde kaldırılıyor; manuel ürün kaynağındaki mevcut ürün kimlikleri korunuyor.

## Doğrulama

- Tasarım: üç regresyon RED → GREEN; UI/önizleme 132/132, sunucu/API 34/34.
- İndirim arayüzü/client/API: kayıp yanıt, yanlış kayıt makbuzu, yetki, arşivden silme, etki engelleri, filtrelerin korunması ve liste dışı kurtarma dahil 93/93. İlgili sunucu ve tasarım API kontrolleri ayrıca 38/38.
- İndirim ayrıntısı: salt okunur ve arşivlenmiş kayıtta yetkili Sil; yetkisiz kullanıcıda gizli (3/3).
- Geniş panel komutunun ilk bölümü: 2357 test, 2295 geçti, 61 başarısız, 1 atlandı. Bu sonuç bütün panel testleri geçti anlamına gelmez. Başarısız 61 test adı, önceki `.tmp/order-bump-tools/panel-full.log` kaydıyla birebir eşleşir; başarısız test adlarında yeni ek yok. İkinci sunucu bölümü ilk bölümün başarısızlığında çalışmadığından ilgili sunucu testleri ayrıca yürütüldü.

- Panel, sözleşme ve veri paketlerinin tip kontrolü geçti.
- Native 225: 24 dar okuyucu/yazıcı koruması; mevcut ödeme, settlement, iade ve stok fonksiyonları korunur. Güncel yedek üzerinde izole geri alma/yeniden uygulama ve altı eşzamanlılık senaryosu geçti. Canlı veri desteği uygulandı; işlem sınırında mevcut 348 tablonun verisi ve 1712 değiştirilmeyen fonksiyon doğrulandı. Gerçek mağaza verisine test kaydı yazılmadı.

## Yayın

9 Ekim 2026 20:51 UTC kabulü: Native 225 ve iki ortak panel yayımlandı. Çalışan panel kaynağı `975f9b3950877df9b4be417c1ff653006e08df2e`; NET → SITE sırası korundu. Dört sahip/vitrin uygulamasının kaynak ve ayarları korundu. Yedi yönetim adresinde yeni sekiz dosyanın sunulan içerikleri doğrulandı; yeni silme ve ürün seçme uçlarında yetkisiz erişim 401 ile reddedildi.

[Canlı kabul özeti](evidence/discount-delete-design-picker/live-release-20261009.md) ve [doğrulama makbuzu](evidence/discount-delete-design-picker/live-release-20261009.json).

Canlı kabul salt okunurdu; gerçek mağazada Sil veya tasarım Uygula işlemi denenmedi. Silme ve tasarım regresyonları izole testlerle doğrulandı; gerçek mağaza indirimi silinmedi.
