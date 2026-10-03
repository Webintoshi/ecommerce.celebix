# Mağaza satışı kurtarma ve ödeme zamanı düzeltmesi — 2026-10-03

## Kapsam ve aday

Kod adayı: `29f2f48991ca5f1de2fbc95e166d2dfb79a04a16`.

Bu çalışma, ödeme beyanı alınmış bir Butik Siora satışının tamamlanamamasını, bekleyen satış penceresinden mevcut işleme dönülememesini ve satış yetkileri ekranındaki yanıltıcı sahip/yönetici formunu giderir. Mevcut satışın tahsilat kanıtı, işlem kimliği ve stok korumaları korunur.

## Hatanın nedeni

POS V3 tamamlanırken siparişin `created_at` alanı tamamlanma zamanıyla, `paid_at` alanı daha önce kaydedilmiş gerçek tahsilat zamanıyla oluşturuluyordu. Tahsilat ile kayıt arasında süre geçtiğinde `paid_at < created_at` oluyordu. PostgreSQL'in `orders_commerce_payment_timestamps_check` kuralı bu kaydı reddediyordu. API bunu genel hizmet hatası olarak gösteriyordu.

Bu durumda sipariş ve stok işlemi geri alınıyor; daha önce ayrı işlemde kaydedilmiş ödeme beyanı korunuyordu. Ekrandaki ödeme beyanı, ikinci bir tahsilat yapılması gerektiği anlamına gelmiyordu.

Önceki native fixture kısmi satışta erken tahsilatla daha geç tamamlanmayı test ediyordu; sipariş henüz tamamen ödenmediği için `paid_at` boş kalıyordu. Tam ödeme denemesinde ise tahsilat ve tamamlanma aynı zaman değerini kullanıyordu. Aralarında süre bulunan tam ödeme ve ilk tahsilatla borcu kapatan ürün iadesi yeni regresyon kapsamına eklendi.

## Düzeltmeler

- **SQL208:** Sipariş başlangıcı `coalesce(selected.payment_received_at,p_now)` kullanır. İlk tahsilatı olan satışta kayıt başlangıcı tahsilat zamanını korur; sıfır tahsilatta tamamlanma zamanını kullanır. Muhasebe satışının ve alacağın `occurred_at` alanları ile POS `completed_at` alanı tamamlanma zamanı olarak kalır.
- **Kaynak koruması:** Eski SQL201 değiştirilmedi. SQL208, yalnız `in_store_sales_mutate_v3` içindeki bir tarih ifadesini değiştirir. Kesin kaynak özeti, imza, sahiplik, yürütme yetkileri ve fonksiyon özellikleri doğrulanır; OID korunur. Geri alma, yalnız incelenmiş önceki fonksiyon tanımını geri yükler ve özel yedeği kaldırır; satış, stok ve muhasebe kayıtlarını silmez.
- **Bekleyen satış:** Ödeme alınmış veya sonucu belirsiz mevcut satışın satırından dönmek pencereyi kapatır ve aynı satışın kurtarma durumunu korur. Başka satışa geçiş ödeme sonucu çözülene kadar kilitli kalır. Ana kayıt/kontrol düğmesine odak döner.
- **Satış yetkileri:** Sahip ve yönetici için rolün verdiği haklar ve tüm aktif depolar açıklanır; bu hakları etkisiz bir kasiyer formuyla değiştirme seçeneği kaldırılır. Kasiyer satışını açarken en az bir depo seçimi kaydetmeden önce doğrulanır. Sunucudaki depo ve yetki kontrolleri korunur.
- **Hata sözleşmesi:** `collection_invalid`, istemcinin düzeltebileceği 400 yanıtı olarak taşınır; genel ve sonucu belirsiz hizmet hatasına çevrilmez.

Önceki fonksiyon özeti: `b359a12e8b2443a89818304e04dd18ae8e6da7c15be157fcfee7f25285f9ed48`.

Düzeltilmiş fonksiyon özeti: `f0ea61a36428dace277fc58a8210951c4c49883699aea8490cbabb88e8e8048e`.

## İzole doğrulama

Odaklı panel, HTTP, istemci ve repository testleri **119 geçti, 0 başarısız**. Mevcut barkod, fiyat, ödeme, müşteri ve işlem tekrarları da bu odaklı grupta yer alır. Son adayın panel üretim derlemesi geçti.

Tekrar çalıştırılabilir PostgreSQL 16 testi:

```sh
node tests/saas-phase3/in-store-sales-register/payment-timing-v3-harness.mjs
```

Native harness **4/4 geçti**:

1. SQL208 öncesinde gerçek zaman farkı olan tam tahsilat, belirtilen PostgreSQL tarih kuralıyla başarısız olur.
2. SQL208 sonrasında tam ödeme, kısmi ödeme, borcu kapatan kısmi ürün iadesi, tam ürün iadesi ve para iadesi, sıfır tahsilat ve sonraki tahsilat çalışır. İlk ödeme kanıtı ve muhasebenin ayrı satış/tahsilat saatleri korunur. İşlem tekrarı stoktan ikinci çıkış oluşturmaz; sağlayıcı denemesi oluşmaz.
3. SQL208 geri alındığında önceki fonksiyon tanımı, özeti, OID, sahiplik ve yürütme yetkileri tam olarak geri döner.
4. SQL208 tekrar uygulanır ve kesin kaynak/yetki doğrulamaları geçer.

Özel kanıt dosyaları: `.tmp/pos208-native-harness.log`, `.tmp/pos-incident-20261003/focused-tests.log`, `.tmp/pos-incident-20261003/panel-build.log`. Bu özel dosyalar ve müşteri verisi içeren tanılama çıktıları Git'e eklenmez. Tam legacy test grubunun tamamının geçtiği iddia edilmez.

## Canlı veri değişikliği

SQL208 öncesinde özel veritabanı yedeğinin kimliği ve okunabilirliği doğrulandı. Zaman düzeltmesi önce canlı veritabanında geri alınan işlemle prova edildi, ardından tek işlemde uygulandı.

Her iki işlem de **299 mevcut iş tablosunun verilerini** ve **1.599 önceki fonksiyonun kimlik/yetkilerini** doğruladı. İş verileri ve fonksiyon yetkileri korundu. Prova sonucu `ROLLBACK`; uygulama sonucu `COMMIT`.

Bu kanıt, SQL208 uygulamasının verileri değiştirmediğine aittir. Aşağıdaki gerçek satış kurtarma işlemi, yetkilendirilmiş mevcut satışın tamamlanması için ayrıca gerekli sipariş, stok ve muhasebe hareketlerini oluşturdu.

## Gerçek satışın kurtarılması

Takılan gerçek satış, yeni bir ödeme veya yeni sepet oluşturmadan önce geri alınan işlemle prova edildi; ardından aynı guardlı kurtarma işlemiyle tamamlandı. Özel uygulama receipt'i `transactionResult: COMMIT` döndürdü.

| Doğrulama | Canlı uygulama sonucu |
|---|---|
| Sipariş numarası | `POS-0000016` |
| Satış durumu | `completed` |
| Tahsil edilen | 410.000 kuruş / 4.100,00 TL |
| Kalan borç | 0 |
| Muhasebe tahsilat olayı | 1 |
| Stok hareketi | İki ürün için toplam 2 |
| Stokun yalnız bir kez düşmesi | Doğrulandı |
| Mevcut ödeme beyanının korunması | Doğrulandı |
| Ödeme sağlayıcısının çağrılması | Hayır |

Özel kanıtlar `.tmp/pos-incident-20261003/live-sale-repair-rehearsal.json` ve `live-sale-repair-receipt.json` dosyalarındadır. Müşteri adı, e-posta, telefon, satış UUID'si ve özel işlem kimlikleri bu genel kabul kaydına alınmadı.

## Panel yayını ve son kabul

| Dağıtım | Durum | Son kanıt |
|---|---|---|
| Ortak NET admin | Adayın canlı yayını tamamlandı | `v6vbkp5g50vtsmk228ofwahd` finished; kaynak ve image tam aday ile eşleşti, resmi ödeme metaverisi korundu; `panel_net-runtime-receipt.json` |
| Ortak SITE admin | Adayın canlı yayını tamamlandı | `j7jm7hcmoh5lgxdzlt59viq8` finished; kaynak ve image tam aday ile eşleşti, resmi ödeme metaverisi korundu; `panel_site-runtime-receipt.json` |

Tamamlanan son kontroller:

- [x] NET ve SITE runtime kaynak/image kimlikleri aday `29f2f48991ca5f1de2fbc95e166d2dfb79a04a16` ile eşleşti. Derlenmiş POS sayfası, tamamla ve çalışan uçları, yeni arayüz metinleri ve hata sözleşmesi doğrulandı. Resmi PayTR build metaverisi ve mevcut mağaza araçları korundu.
- [x] Son yayın doğrulaması `verified`, global kuyruk `idle`, 2 admin hedefi ve 2 değişmemiş storefront şahidi döndürdü. Gizli bağlantı ayarları, önizleme/ödeme yapılandırmaları ve storefront yayınları korundu.
- [x] Güzide, Lilyum, Alpler ve Butik Siora storefront/admin adreslerinde 8/8 sağlık kontrolü HTTP 200 ve `ok`; TLS doğrulaması açık. Kontrol zamanı: 2026-10-03 16:14:56 UTC.
- [x] Canlı Siora ekranında `POS-0000016`, tahsil edilen 4.100 TL ve kalan 0 TL görüldü. Bekleyen satış sayısı 0; Yeni satış düğmesi kullanılabilir. Sahip yetkileri tüm aktif depoları ve dört hakkı gösteriyor; etkisiz kayıt düğmesi bulunmuyor.
- [x] 390 piksel mobil ekranda yatay taşma yok (`scrollWidth = innerWidth = 390`); yetki penceresi 352 piksel, kapatma düğmesi 44 piksel. Escape ile kapatma ve odağın satış yetkileri düğmesine dönüşü doğrulandı. Ekran boyutu eski haline getirildi.

Canlı kabul tamamlandı. Ek sahte satış, tahsilat veya ödeme sağlayıcısı çağrısı üretilmedi. Gerçek satışın kayıt sonrası salt okunur kontrolünde sürüm 35, tek 410.000 kuruş ödeme beyanı ve iki tüketilmiş stok rezervasyonu görüldü; stoklar önceki 1/4 değerlerinden 0/3 değerlerine düştü.

## Görsel kanıtlar

Müşteri iletişim bilgileri görünmeyecek şekilde alınan canlı ekran görüntüleri:

- [Tamamlanan satış özeti](evidence/pos-incident-2026-10-03/completed-sale-summary.png)
- [Sahip yetkileri](evidence/pos-incident-2026-10-03/owner-permissions.png)
- [Mobil sahip yetkileri](evidence/pos-incident-2026-10-03/owner-permissions-mobile.png)
