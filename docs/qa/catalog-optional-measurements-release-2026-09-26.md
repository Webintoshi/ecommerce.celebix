# İsteğe bağlı ürün ölçüleri — 2026-09-26

## Kapsam

Hızlı ve detaylı ürün yükleme, tek/çoklu varyant ekleme ve ürün düzenleme ekranlarına ortak **Ölçü ve teknik bilgiler — İsteğe bağlı** bölümü eklendi.

| Bilgi | Birimler |
| --- | --- |
| Ağırlık | g, kg |
| Hacim | ml, l |
| Uzunluk | cm, m |
| En, boy, yükseklik | Her biri ayrı cm, m |
| Alan | m² |
| Paket içeriği | adet |

Her alan bağımsız ve isteğe bağlıdır. Boş alanlar kaydı engellemez ve sıfıra dönüşmez. `14,89` ile `14.89` aynı değeri üretir; üç ondalık basamak tam olarak saklanır. Dolu değerler pozitif olmalıdır; paket içeriği tam sayıdır. Kayıtlı değerler düzenleme formuna geri gelir; kullanıcı bütün alanları boşaltırsa ölçüler temizlenir. Bir alanı boşaltmak diğer ölçüleri korur.

Ölçüler varyantın isteğe bağlı fiziksel bilgileri olarak saklanır. Ürün fiyatı, adet stoku, kargo desisi, mevcut birim fiyat bilgisi ve altın fiyatlandırma gramı bağımsız kalır. Varyantların farklı ölçüleri olabilir.

## Kalıcı kayıt ve uyumluluk

Kaynak: `c55b88f8c6c4e1679bf58cf3d22ccbc0c160cac4`, dal: `codex/in-store-sales-register`.

SQL162, `saas.product_variants.measurements` alanını ve 16 yeni sürümlü/özel işlevi ekler. Aynı kayıt işlemi içinde doğrulama, yetki, mağaza sınırı, sürüm, barkod/SKU çatışmaları ve tekrar güvenliği korunur. Gönderilmeyen ölçü alanı güncellemede korunur; açık `null` temizler.

Eski storefront ve admin okuma şekilleri değişmedi. Yeni admin okuma sürümleri ölçüleri ekler. Satış/SEO ve görsel sonrası yayın işlemlerinde eski kalıcı sonuç korunur; yeni yanıt, yalnız varyant sürümü aynıysa ölçü ekler. Bu, eski sürüm numarasıyla yeni bir ölçünün birleşmesini engeller.

[Canlı migration kanıtı](evidence/catalog-optional-measurements/live-migration.json): 20 mevcut ürün, stok, sipariş ve işlem tablosunun migration öncesi/sonrası özetleri aynı; önceden mevcut **1217 işlevin** gövdesi, sahibi ve erişim izinleri aynen korunmuştur. Mevcut ürünlere zorunlu değer veya otomatik dolgu eklenmedi. SQL160 kategorileri ve SQL161 WEB/POS numaralandırması korundu.

Ölçü kaydı varken SQL down veriyi silmeden durur. Uygulama geri alındığında ek şema ve kullanıcı ölçüleri korunmalıdır; eski uygulama bu alanları göstermez. [Kopyada geri alma provası](evidence/catalog-optional-measurements/rollback-rehearsal.json) hem veri koruma engelini hem boş şema geri alımını doğrular; prova transaction'ı tamamen geri alınmıştır.

## Doğrulama

- 52 arayüz, form, taslak ve davranış testi: PASS.
- 90 contract/repository testi ve 8 HTTP testi: PASS.
- Gerçek PostgreSQL 16 kopyasında 18 kontrol: PASS. Oluşturma, okuma, düzenleme, temizleme, işlem tekrarı, eş zamanlı güncelleme, yanlış mağaza/yetki, tek boyut ve çoklu varyant kayıtları kapsandı.
- Contracts/data/panel tür kontrolleri ve ortak admin/storefront derlemeleri: PASS.
- İsimlendirilmiş yerel arayüz testinde sekiz ölçü kaydetme, yenileme ve tümünü temizleme: PASS; fiyat ve stok aynı.
- 1440, 1024, 390 px hızlı/detaylı form: yatay taşma 0; mobilde tek sütun ve son alan kayıt çubuğu üstünde erişilebilir.
- İsteğe bağlı sekiz girişte `required=false`; klavye odağı görünür ve girişten kategoriye geçiş çalışır; yerel tarayıcı hata kaydı 0.
- [Atlas görsel inceleme](evidence/catalog-optional-measurements/visual-review.md): PASS.

[PostgreSQL kontrolleri](evidence/catalog-optional-measurements/postgresql-behavior.json), [genel doğrulama](evidence/catalog-optional-measurements/verification.json), [kaynak bağları](evidence/catalog-optional-measurements/source-binding.json), [çalışan kaynak manifesti](evidence/catalog-optional-measurements/runtime-manifest.json).

Ekranlar: [hızlı 1440](evidence/catalog-optional-measurements/quick-1440.png), [hızlı 1024](evidence/catalog-optional-measurements/quick-1024.png), [hızlı 390](evidence/catalog-optional-measurements/quick-390.png), [mobil son alan](evidence/catalog-optional-measurements/quick-390-last-field.png), [detaylı 1440](evidence/catalog-optional-measurements/advanced-1440.png), [detaylı 1024](evidence/catalog-optional-measurements/advanced-1024.png), [detaylı 390](evidence/catalog-optional-measurements/advanced-390.png).

## Yayın

İki ortak admin uygulaması `c55b88f8c6c4e1679bf58cf3d22ccbc0c160cac4` kaynağıyla yayınlandı:

| Uygulama | Dağıtım | Tamamlanma (UTC) | Çalışan container |
| --- | --- | --- | --- |
| Butik Siora / .net | `x128dia8pscyur677ui7tkks` | 15:44:53 | `fa08fc1916f5` |
| Güzide / .site | `zke84g7xdem45xtw27ourmwz` | 15:49:34 | `f1e68937a1f7` |

[Dağıtımlar](evidence/catalog-optional-measurements/deployments.json) tamamlandı. [Çalışan sürüm kanıtı](evidence/catalog-optional-measurements/runtime-verdict.json) iki uygulamada 22 özellik dosyasını ve korunması gereken mevcut kaynakları git içeriğiyle karşılaştırdı: PASS. Yeni ürün/detay, mağaza satış ve eski bağlantı sayfalarının derlenmiş rotaları mevcut. SQL160/161 kaynakları aynı.

[Son yapılandırma](evidence/catalog-optional-measurements/final-config.json): kaynak sabitleme, mevcut dağıtım kancaları, kapalı otomatik/önizleme dağıtımları ve resmî ödeme kanıt bağları doğrulandı. Güzide PayTR test/canlı bağları etkin; Butik Siora önceki kapalı durumunu koruyor. Iyzico onayı eklenmedi.

[Canlı arayüz kontrolü](evidence/catalog-optional-measurements/live-browser.json): Butik Siora hızlı/detaylı ve Güzide hızlı yüklemede sekiz alan mevcut, boş ve `required=false`; yatay taşma 0, tarayıcı hata kaydı 0. Canlı merchant ürünleri, siparişleri veya tahsilatları QA için değiştirilmedi.

[Sağlık kontrolü](evidence/catalog-optional-measurements/final-health.json): dört admin adresinde HTTP200, uygulama `ok` ve Redis `ready`; iki mağaza sitesi HTTP200.

[Son veritabanı kontrolü](evidence/catalog-optional-measurements/final-dbcheck.json) salt okunur olarak 16 yeni işlevi, nullable ölçü alanını ve doğrulanmış kısıtı tekrar doğruladı. SQL160/161 işlevleri, numaralandırma tabloları ve trigger'ları korundu.

[QA temizliği](evidence/catalog-optional-measurements/qa-cleanup.json) yalnız isimlendirilmiş `celebix_measurements_qa_20260926` kopyasını sıfır aktif bağlantıyla kaldırdı ve bu çalışmanın geçici bağlantı köprüsünü kapattı. [Son temizlik kaydı](evidence/catalog-optional-measurements/final-cleanup.json) yedeklerin SHA256 değerlerini ve erişim izinlerini tekrar doğruladı. Yerel test sunucusu, bu çalışmanın test sekmeleri ve geçici ekran boyutu ayarı kapatıldı; geçici bağlantı dosyası kaldırıldı. Canlı veritabanı, çalışan/geri dönüş imajları ve diğer görevler korundu. Temizlik sonrası altı adres tekrar sağlık kontrolünden geçti.

Canlı SQL öncesi yedek `/data/celebix-release-backups/measurements_live_20260926_153533.dump`, SHA256 `db6379cdaeffc422b87e4a91d799d3448d3b0534dd241dfb332495e4b968e650`. İlk yedek `/data/celebix-release-backups/measurements_20260926_151435.dump`, SHA256 `1d173ffd53b2f5441263b94b8bf084cd19dd7107a04af281aa413b346543b22b`. İkisi de sunucuda erişimi kısıtlı olarak korundu.

Bu yayın kaydı ayrı bir dokümantasyon commit'i olarak tutulur; çalışan uygulama kaynağı `c55b88f8c6c4e1679bf58cf3d22ccbc0c160cac4` olarak sabit kalır. Sonraki geliştirme bu kaynağı birleştirmeli ve canlı SQL162'yi yeniden uygulamamalıdır; sonraki şema sıra numarası en az 163 olmalıdır.
