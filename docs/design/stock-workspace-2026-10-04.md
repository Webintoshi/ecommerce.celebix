# Tek Stok ekranı — 4 Ekim 2026

## Kullanıcının hedefi

Sayım, stok güncelleme, stok alanları ve satın almaları bir sayfada toplamak.
Günlük stok takibi ilk defa kullanan kişinin anlayacağı kadar açık olacak;
mevcut güçlü işlemler, yetkiler ve güvenli kayıt akışları korunacak.

## Birleşik ekran

- Tek menü: Ürünler → Stok (`/products/stock`).
- Ürünler: depo seçimi, ürün/varyant/SKU araması, gerçek depo miktarı,
  stok yok/azalan stok filtresi ve görünen listeyi CSV olarak alma.
- Sayımlar, Taşımalar, Satın almalar ve Depolar aynı ekranın görünümleri.
- Tek ana Stok işlemi düğmesi. Kayıt oluşturma/düzenleme ortadaki pencerede;
  telefon ekranında erişilebilir tam alan, odak kilidi ve güvenli kapanış.
- Ürün/depo adları gösterilir. UUID, kalem kimliği, sürüm ve teknik açıklamalar
  günlük işlemlerin dışına taşınır. Kimlikler kayıt sözleşmesinde korunur.
- Maliyet TL girilir; 14,89 ve 14.89 güvenli biçimde kuruşa dönüştürülür.
- Stok düzelt gerçek seçili depo/varyant için sayım akışını başlatır.
  Sayım başlangıç miktarını alır, kullanıcı gerçek miktarı girer, farkı
  inceleyip tamamlar. Toplam katalog stok düzeltmesi depoya özel gibi sunulmaz.
- Satın alma siparişini kaydetmek stok artırmaz. Tam/kısmi teslim kabulü
  gerçek gelen miktarı artırır; sipariş ve mal kabulü ayrı görünür.

## İşlev envanteri ve korunacak davranış

Sayım: liste/arama/durum, oluştur/düzenle, başlat, sayılan miktarları kaydet,
fark ve tamamla/iptal. Başladıktan sonra depo/ürün listesi sabit kalır.

Taşıma: kaynak/hedef farklı depo, taslak/düzenleme, gönder, teslim al, iptal.
Yoldaki ve tamamlanmış kayıtlar ayrılır; stok güvenlikleri değişmez.

Satın alma: tedarikçi, ürünler, miktar, maliyet, taslak, sipariş ver,
kısmi/tam teslim ve yalnız sunucunun kabul ettiği taslak/sipariş iptali.

Depolar: oluştur, ad düzenle, durum, arşivleme ve varsayılan/stok/rezerv/açık
işlem engelleri korunur. Depo düzenleme penceresi ikinci bir pencereye gömülmez.

## Veri ve sınırlar

Mevcut `/api/inventory` ve katalog seçenekleri kullanılır; yeni veritabanı,
servis veya ticari ödeme değişikliği yok. `quantity` yalnız **Depo stoku**.
Rezerv ve satılabilir stok verisi bu okumada yok; bunlar tahmin edilmez.
Eksik bakiye sıfır diye üretilmez. Hata/yükleme ile sıfır ayrı gösterilir.
İşlem listeleri mevcut sunucu sınırlarıyla gösterilir; tüm geçmiş toplamı
iddiası yok. Hareket API'si olmayan gerçek stok hareket günlüğü uydurulmaz.

`inventory.read/manage` ve `purchasing.read/manage` ayrı kalır. Sunucunun
expectedVersion, işlem kimliği ve çift kayıt koruması korunur. Belirsiz sonuçta
aynı satış/stok işlemi yeniden oluşturulmaz. Eski liste, yeni ve detay adresleri
aynı birleşik ekranın tam ilgili işlemine yönlendirilir.

## İnceleme kaynakları

- Shopify sayım: https://help.shopify.com/en/manual/products/inventory/inventory-counts
- Shopify satın alma: https://help.shopify.com/en/manual/products/inventory/purchase-orders
- Shopify taşıma: https://help.shopify.com/en/manual/products/inventory/inventory-transfers

## Doğrulama

Para dönüşümü, ortak stok verisi, izinler, kısmi teslim iptali, eski adresler,
mevcut native lifecycle/yeniden deneme korumaları ve yeni çalışma ekranı testleri.
1440/1024/390 görünüm, klavye, odak, yükleme/boş/hata ve kayıt sonrası devam.
Önce tek yerel production build; güncel ortak kaynakla koordine NET→SITE yayın.
Canlı mağazada sahte mal kabulü/sayım veya finans kaydı oluşturulmaz.
