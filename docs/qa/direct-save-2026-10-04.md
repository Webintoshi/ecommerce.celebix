# Doğrudan kayıt — 4 Ekim 2026

## Kullanıcı kararı

Kaydet/Uygula başarılı olduğunda kayıt gerçek etkisiyle tamamlanır. Ürünler ve blog/sayfalar doğrudan yayımlanır. Eski taslaklar okunurken topluca etkinleştirilmez. Kullanıcının açıkça gizlediği içerik, arşivler, ödeme beyanları, ürün teslim alma ve sayımın stok farkını uygulama aşamaları korunur.

## Uygulama

- Satın alma kaydı sipariş edilmiş, yeni sayım sayılıyor, taşıma yolda olarak tek kayıtla başlar. Native kayıt ve başlatma aynı veritabanı işlemini kullanır.
- Fiyat listesi, gram referansı, kampanya ve manuel sipariş tek Kaydet işlemiyle geçerli sonuca ulaşır. Kampanya tarihleri ve bilinçli duraklatma korunur. Manuel sipariş ödeme yapılmış sayılmaz.
- Ürün, blog/sayfa, koleksiyon, politika, kategori SEO ve teslimat ayarları için gereksiz taslak/yayın adımları kaldırıldı. Görsel kaydı tamamlanmadan başarı gösterilmez.
- Toplu aktarımda fiyatı eksik ürünler sessizce taslağa alınmaz; kayıt başlamadan düzeltme istenir. Kaynakta açıkça kapalı olan ürün korunur.
- Belirsiz manuel sipariş ve referans kaydı aynı işlem anahtarı ve niyetle yeniden doğrulanır. Yeni stok hareketi ya da ikinci sipariş oluşturulmaz.
- Yeni sunucu işlemleri önbelleği yalnız doğrulanmış kayıttan sonra, ilgili mağaza için yeniler.

## Doğrulama

- Stok odaklı paket: 177/177; stok fixture yaşam döngüsü: 4/4.
- Ürün, içerik, koleksiyon, teslimat ve kategori SEO paketi: 125/125; son ürün davranış paketi: 4/4.
- Aktarım ve POS model regresyonları: 57/57.
- Önbellek: RED doğrulandı; düzeltme sonrası 6/6. Kayıt öncesi ve rollback sırasında yenileme yok.
- Bağımsız backend incelemesi: 31/31. Manuel sipariş belirsiz sonuç kilidi incelemede bulundu ve aynı işlem doğrulamasıyla düzeltildi; aynı niyet ve anahtarla tekrar deneme incelemesi geçti.
- Beş sunucu facade zinciri: yeni metotlar için RED doğrulandı; eski kayıt desteği korunarak registration → resolve → call dahil 17/17 geçti.
- Atomik fiyat/referans/kampanya/sipariş repository/API: 104/104; istemci/UI/API: 177/177; fiyat listesi console: 8 geçti, 1 opt-in Next guard atlandı, 0 hata.
- Son manuel sipariş reload incelemesi: 3/3; aynı HTTP gövdesi/anahtarıyla devam, değişen niyetin ağ çağrısından önce reddi ve kişisel veri saklanmaması doğrulandı.
- SaaS veri paketi ve ortak panel tip kontrolleri başarılı.
- Yeni native SQL, migration, ödeme sağlayıcısı, gizli ayar veya sahip paneli değişikliği yok.

Eski ürün-onboarding kaynak metni testlerinden üçü mevcut başlangıç sürümünde de başarısızdır; yeni doğrudan kayıt davranışı bu eski metin kalıplarıyla değerlendirilmedi. Tam ortak test paketindeki önceki ilgisiz hatalar bu çalışma kapsamında yeniden çalıştırılmadı.

## Yayın

Başlangıç: iki admin 4c477071f86bf0053bb95fd7ca25c04b5204f50e; storefront 7d864534c4f3d71f6a20717135aa20ded2a03f15; native schema 214. Son tip kontrolü, gerçek ortak admin build ve NET→SITE kabul kayıtları yayın doğrulamasından sonra bu belgeye eklenecek. Üretimde sahte satış veya tahsilat oluşturulmayacak.
