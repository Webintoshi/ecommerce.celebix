# Yeni WEB / POS sipariş numaraları — 2026-09-26

## Kapsam

Kullanıcı yalnız yeni siparişlerin numaralarını değiştirmeyi seçti. Önceki siparişler, makbuzlar ve işlem tekrarlarının kayıtlı sonuçları korunur.

- İnternet siparişleri `WEB-000001` biçiminde, en az altı hane.
- Manuel sipariş ve tamamlanan mağaza satışı `POS-0000001` biçiminde, en az yedi hane.
- Sayaçlar mağaza ve WEB/POS serisi bazında ayrıdır. Sınır aşıldığında haneler doğal olarak büyür; kesme, sıfırlama veya döngü yoktur.
- Mağaza satış sepetinin UUID tabanlı `saleNumber` kimliği sabit kalır. Kısa POS `orderNumber` gerçek sipariş oluşurken atanır; bekletilen sepetler numara tüketmez. Tamamlanan ekran ve son satışlar gerçek `orderNumber` değerini gösterir.
- Ödeme sağlayıcısı, attempt/session ve QO bridge referansları değişmez. Dış pazaryeri ve manuel içe aktarma referansları korunur.

## SQL161 tasarımı

Özel sayaç ve PII içermeyen kalıcı tahsis tabloları aynı sipariş transaction'ı içinde yazılır. Her mağaza/seri için kilit, eş zamanlı tahsisleri sıralar; başarısız sipariş eklemesi sayacı ve tahsisi birlikte geri alır. Tahsis sipariş kalıcı silinince saklanır ve numara yeniden kullanılmaz. Uygulama rolleri bu tablolara ve yardımcı işleve doğrudan erişemez.

Mevcut on sipariş oluşturma işlevi tam önceki tanım/sahip/ACL/hash doğrulamasıyla güncellenir. Gerçek INSERT öncesi tahsis ve INSERT RETURNING çıktısı makbuz/işlem sonuçlarına aynı numarayı taşır. SQL geçişinde daha önce çalışmaya başlamış eski işlev gövdesi kendi eski numara ve sonucunu tutarlı biçimde korur; genel tetikleyici eski gövdenin numarasını sonradan değiştirmez.

Numara tahsisi, atanmış kimlik ve geri dönüş metadata kayıtları değişmezlik kontrolleriyle korunur. Sayı tüketilmeden SQL down önceki on işlevi birebir geri getirir. Tahsis yapıldıktan sonra SQL down engellenir; normal uygulama geri dönüşünde SQL161 korunur.

### İlgili stok kontrolü düzeltmesi

Gerçek quick-link callback testinde, `quick_checkout_settle_success_core` stok UPDATE sonucunu üç marker-reset PERFORM işleminden sonra sayıyordu. Son PERFORM ROW_COUNT değerini 1 yaptığı için stok takipsiz (0 güncellenen varyant) ve çok varyantlı satışlar hatalı geri alınabiliyordu. Aynı dondurulmuş gövdede yalnız GET DIAGNOSTICS konumu, UPDATE'in hemen sonrasına taşınır. Ödeme tutarı, sağlayıcı referansı ve durum/yetki kuralları değişmez.

## Paralel kategori yayını

Kategori SQL160 başka görev tarafından yayımlandı. Numaralandırma SQL161 alanını kullanır; kategori `c94f6980` ve `3e6e9186` commitleri yeni ortak kaynağa birleştirilir. Kategori SQL160 canlıda yeniden uygulanmaz. Önceki canlı kategori kaynağı `3e6e91862b5739e72c90d44e5cc715e6e8af0fb0` ve dalı `codex/categories-live` doğrulanır.

## Doğrulama ve yayın

Yayın kaynağı `29afede4319f733560a20e3fae068331048816d9`; dal `codex/in-store-sales-register`.

- İlgili POS UI/HTTP ve gerçek React davranış testleri: **61/61**.
- Kategori birleşimi sonrası gerçek React ve kategori contract testleri: **21/21** (ayrı kontrol grubu; bazı POS testleri ilk grupta da vardır).
- Gerçek PostgreSQL16 numaralandırma: **11/11**; iki bağlantı yarışında gerçek `pg_blocking_pids` kilit bekleme kanıtı ve tahsis sonrası down reddi dahil.
- Gerçek WEB sipariş/ödeme entegrasyonları: **9/9**. Altı internet INSERT sahibi çalışma akışı, makbuz/işlem tekrarları ve dondurulmuş sağlayıcı referansları test edildi. Sıfır ve iki takipli varyant quick callback'i doğru stok/rezervasyon etkileri ve tek siparişle tamamlandı.
- İki kullanılmayan eski abandoned-cart INSERT gövdesi kaynak/hash incelemesiyle doğrulandı; çalışma zamanı fixture'ı yeniden kurulmadı. Bu ikisi için runtime sonucu iddia edilmez.
- Bağımsız SQL161/UI incelemesinde somut engelleyici bulgu yok.
- Birleştirilmiş ortak admin ve storefront production build kontrolleri exit0; TypeScript ve statik sayfa üretimi başarılı.

Prova kopyası kategori160 öncesi yedekten alınmıştı: **1204** önceki işlevin exact down restorasyonu, **1194** dokunulmamış işlev, on amaçlı işlev değişikliği, beş özel yardımcı ve önceki sahip/ACL'lerin korunması doğrulandı. Altı merchant tablo durum özeti aynı kaldı. Canlı katalog kategori160 sonrası **1212** işlevdir; canlı geçişte on aynı yaratıcı değişti, diğer **1202** işlev ve tüm eski sahip/ACL değerleri korundu; toplam **1217** oldu.

Prova komutları `tests/saas-phase3/order-number-sequences/manifest.json` dosyasındadır. Core POS RED gerçek tamamlamada uzun POS UUID yerine POS-0000001 beklentisinin başarısızlığıydı. İlk WEB makbuz RED sonucu araç çıktısında gözlenip kaydedildi; `/tmp/order-number-integrations-red.log` bağlantı kontrolünün daha eski başarısız denemesidir ve özellik RED kanıtı olarak kullanılmaz. Iyzico hosted quick fixture yalnız adlandırılmış QA kopyasında sentetik tarihsel profil kullanır; canlı Iyzico yetkisi veya sağlayıcı aktivasyonu yapılmadı.

## Canlı veritabanı

SQL161 up → assertions tek transaction içinde PASS. Tekrar okunabilir snapshot içinde **28** sipariş/stok/ödeme tablosu satır sayısı ve digest değeri önce/sonra birebir aynı: [canlı DB kanıtı](evidence/order-number-series/live-database.json). DDL yeni sipariş, stok düşümü veya tahsilat oluşturmaz.

Geçiş sonrası ilk salt okunur kontrolde Siora/Güzide WEB ve POS sayaçları sıfır, tahsis sayısı sıfır ve canlıda sentetik QA mağazası yoktur. Sonraki gerçek siparişler 1'den başlar: [sayaç kontrolü](evidence/order-number-series/live-numbering.json).

- Güncel canlı yedek: `/data/celebix-release-backups/order_number_live_20260926_135749.dump`; SHA256 `382f50a16f718a4edd497a9c85148d8e05df17fbf0cef5286aa2e2e7ec5a906a`.
- Prova kopyası yedeği: `/data/celebix-release-backups/order_number_20260926_133248.dump`; SHA256 `97875258f07c6d2240bd6fbf8181ba0c31c0e42a0dee22798d3c4cd5799c131f`.
- SQL161 up SHA256 `aad3923f009f722de2e4b8b1306309e566c7fdc4316b5a64ca4da8ba5804b99c`.
- Down SHA256 `9babd30dc527da6eac2847e0221571765f9b0a3a821f268bddd83ebf7438cccb`; assertions SHA256 `e816bff6440f58f2c8ad884ac32ba93fc311bbad28debfd91564c16376957609`.

## Ortak uygulama yayını

İki ortak admin uygulaması aynı `29afede4319f733560a20e3fae068331048816d9` kaynağıyla tamamlandı: [deployment kayıtları](evidence/order-number-series/final-deployments.json).

| Uygulama | Deployment | Bitiş (UTC) | Çalışan container |
| --- | --- | --- | --- |
| `.net` / Siora | `eu8i0qj5pedomc2pdta2ny1s` | 14:24:24 | `a427f5d0ed37` |
| `.site` / Güzide | `ss0sqx0bfgj64f7diyfvtut3` | 14:28:55 | `4db95ab3a790` |

Her iki çalışan image'ın SOURCE_COMMIT değeri, 12 kaynak dosyası SHA256 değeri, derlenmiş register/legacy route'ları ve resmi ödeme metadata bağları PASS: [çalışan sürüm kanıtı](evidence/order-number-series/live-runtime.json). Kategori SQL160/CategoryManager ve önceki stok SQL159/katalog özet kodu aynı doğrulamaya dahil.

Canlı release ayarları, kaynak/dal pinleri, auto/preview=false, önceki pre/post hook hash'leri ve ödeme onay modu/flag matrisi korundu: [release yapılandırması](evidence/order-number-series/release-configuration.json). PayTR TEST digest `sha256:4abf2c696195b75c7fb11c9a407178715ff989c6bce02919221835ed660b5a36`, LIVE digest `sha256:3790adca67f55bcb77488190d30053615c907e2408959a3466f176aeb9b6d1e1`; `.site` build/runtime onay flag'leri açık, `.net` flag'leri kapalı. Iyzico onay yetkisi eklenmedi.

Yayın sonrası SQL161 salt okunur assertions PASS; tahsis ve iki mağazanın WEB/POS sayaçları hâlâ sıfır: [son DB kontrolü](evidence/order-number-series/final-database.json). Canlıda numara tüketmek için QA siparişi/satışı/tahsilatı oluşturulmadı.

Siora `/orders/quick-links` yeni yayın sonrası Chrome'da yeniden yüklendi: depo, barkod arama, indirim, manuel harici POS açıklaması ve satış özeti hazır. Son satışlar salt okunur açılarak mevcut uzun POS numarasının korunduğu gözlendi; pencere kapatıldı. Yeni POS tamamlaması canlı merchant verisiyle denenmedi; davranışın kanıtı gerçek PostgreSQL kopyası ve React testleriyle çalışan kaynak eşleşmesidir: [tarayıcı kontrolü](evidence/order-number-series/live-browser.json).

Son temizlik sonrası dört admin alan adı ve iki storefront HTTP200; adminlerde Redis ready: [son sağlık kontrolü](evidence/order-number-series/final-health.json).

### Yayın sırasında disk kapasitesi ve toparlanma

İlk ortak panel derlemesi sırasında sunucunun 150 GB kök diski %100 doldu. Ana PostgreSQL ve Coolify DB yeniden başlama döngüsüne girdi; altı admin/storefront sağlık kontrolü başarısız oldu. Bu nedenle ilk yayın denemesi kesintisiz başarılı olarak değerlendirilmez.

Yalnız kullanılmayan, tekrar üretilebilen Docker derleme önbelleği temizlendi (`docker builder prune --all --force`; araç toplam 25.7 GB cache kaydı raporladı). Gerçek dosya sistemi boş alanı yaklaşık 16 GB'a çıktı. Uygulama image'ları, kalıcı volume'ler, merchant verileri ve yedekler silinmedi. Ana PostgreSQL ve Coolify DB sağlıklı duruma döndü.

Toparlanma sonrası SQL161 salt okunur assertions PASS. Aynı **28** mevcut sipariş/stok/ödeme tablosunun digest ve satır sayıları geçiş sonrasıyla birebir aynı; tahsis sayısı ve iki mağazanın WEB/POS sayaçları sıfır: [toparlanma sonrası DB kanıtı](evidence/order-number-series/post-recovery-database.json). Dört admin alan adı ve iki storefront HTTP200; adminlerde Redis ready: [toparlanma sağlık kontrolü](evidence/order-number-series/health-recovered.json).

İlk `.site` yayını `bvcztfabnx0lph7x6wqtzsdc` derlemeyi tamamlamış fakat veritabanı kesintisinden sonra eski `in_progress` kaydında kalmıştı. Kayıtlı işlem PID'si ve eski worker süreçleri artık yoktu; yardımcı container yalnız tini/tail çalıştırıyordu. Tamamlanan 29af image'ı ağ erişimsiz Node incelemesinde 12 kaynak dosyası, iki derlenmiş route ve ödeme metadata eşleşmeleriyle PASS aldı. Coolify'nin kendi iptal akışı izlenerek yalnız bu takılı deployment iptal edildi, PID temizlendi ve yalnız yardımcı container kaldırıldı. Genel Coolify yeniden başlatılmadı.

Mevcut `.net` kuyruğu `eu8i0qj5pedomc2pdta2ny1s` önce ilerledi; `.site` aynı 29af kaynakla `ss0sqx0bfgj64f7diyfvtut3` olarak yeniden sıraya alındı. `force_rebuild=false` kullanıldı; yapılandırma farkı varsa Coolify'nin yeniden derleme kararı korunur, son başarılı config snapshot'ı değiştirilmez. Aynı application/commit için başka aktif yayın olmadığı kontrol edildi. İptal edilmiş eski iş, tekrar dağıtılsa bile Coolify handle başındaki durum kontrolünde çıkar.

Bağımsız salt okunur inceleme kalan `s7xx...` PostgreSQL yeniden başlama döngüsünün yayın öncesinde de bulunan SSL özel anahtar izin hatası olduğunu gösterdi. Aktif `ta8...` PostgreSQL'den ayrı kalıcı volume/veri yolu kullanır; bu yayın kapsamında bu ayrı kaynak değiştirilmedi.

Her iki çalışan sürüm doğrulandıktan sonra yalnız kullanılmayan derleme önbelleği ikinci kez temizlendi; araç 8.481 GB cache kaydı raporladı. Son dosya sistemi boş alanı **12,882,202,624 byte (yaklaşık 12 GiB)**, ana PostgreSQL ve CoolifyDB healthy. Bağımsız inceleme her iki uygulamanın `29af`, kategori `3e6` ve stok `d56` image tag'lerinin korunduğunu doğruladı: [kapasite ve geri dönüş kayıtları](evidence/order-number-series/final-capacity.json).

Adı doğrulanmış, aktif bağlantısı olmayan `celebix_order_number_qa_20260926` prova veritabanı kaldırıldı; canlı DB'ye dokunulmadı. Yedekler korundu. Geçici QA ayarı ve SSH yönlendirmeleri kapatıldı: [QA temizliği](evidence/order-number-series/qa-cleanup.json). Bu belgenin sonraki yalnız dokümantasyon commit'i uygulamaların sabit 29af yayın pinini değiştirmez. Sonraki SQL numarası en az 162 olmalıdır; kategori160 ve numaralandırma161 birleşik kaynağı korunmalıdır.
