# Mağaza satış ekranı — 2026-09-26

Yayın kaynağı: `1b6d3f0f82183c1445d2eb57b17f2a25a2f2c27e`; dal: `codex/in-store-sales-register`.
Önceki iki ortak panel kaynağı: `8f96f7654ccf76b2ddca45125680c8d6031c41f1`. Ürün oluşturma ekranı ve tablet düzeltmesi bu yayında korunur. Kullanıcının asıl çalışma dizinindeki diğer değişikliklere dokunulmaz.

## Ekran ve işlem akışı

- Bütün tenant adminlerinde `/orders/quick-links` mağaza satış ekranıdır. Önceki ödeme bağlantısı ekranı `/orders/payment-links` adresindedir; mevcut müşteri bağlantıları korunur.
- Barkod Enter ile tam eşleşmeyle aranır; tekrar okutmak adedi artırır. Ürün adı/SKU araması açık ürün seçimi gerektirir; eski arama sonucu kendiliğinden eklenmez.
- Depo, sepet, yüzde/TL indirimi, isteğe bağlı müşteri adı/not, bekletilenler, bekleyen ödemeler, son satışlar ve günlük net/indirim özeti bulunur.
- Ödeme tutarı sunucuda tekrar hesaplanır; fiyat değiştiyse kullanıcı yeniden onaylar. Hazırlanan tutar ve ortak internet/mağaza stoku korunur.
- Harici fiziksel POS'tan ödeme manuel alınır. Ödeme alındı beyanı kalıcı kaydedildikten sonra satış tamamlanır. Banka POS entegrasyonu yoktur. Yeniden açılmış bekleyen satışta mevcut slip kontrolü ve tekrar tahsilat yapılmaması açıkça gösterilir.
- Ödeme bekleyen/alınmış stok rezervasyonu otomatik sona ermez. Aynı işlem/satış kimliği ile kurtarma ve tekrar deneme mükerrer satış oluşturmaz.
- Anonim satış için sahte e-posta veya adres üretilmez; tamamlanan sipariş mağazadan teslim, ödenmiş olarak kaydedilir.

## Doğrulama

- Contracts: 363/363. Data: 668/668. Repository hedef testleri: 9/9.
- Son tam panel çalıştırması, eşzamanlılık 4: 1479 başarılı + 1 mevcut skip; ikinci React server grubu 63/63; hata yok. Yoğun ilk paralel çalıştırmadaki mevcut Next geliştirme entegrasyonu timeout'u kontrollü tam çalıştırmada geçti.
- UI istemci/controller/gerçek React DOM: 49/49; bağımsız tekrar incelemede 15 regresyon ve 8 ek güvenlik probu başarılı. Panel TypeScript kontrolü başarılı.
- Etkilenen owner, ortak storefront ve müşteri paneli production build kontrolleri geçti. Yerel ilk panel build'in elle girilmiş sürüm değeri yayın kimliği olarak kullanılmadı; yayın kimliği yalnız aşağıdaki uzak build ve çalışan container kontrolüne dayanır.
- Gerçek React tarayıcı kontrolü: 1440/1024/390 genişliklerde yatay taşma yok; mobil ana işlem 48 px, panel menüsünün üzerinde. Yinelenen okutma, yüzde/TL indirim, ödeme kilidi, bekleyen slip uyarısı ve `ABC-123` tam barkod araması geçti. Örnek taşıma gerçek banka ödemesi veya merchant siparişi oluşturmaz.
- PostgreSQL 16.14 tam kopyasında 157 down/up, assertions ve gerçek repository davranışları geçti. Ayrı iki bağlantılı testte mağaza ve internet son stok yarışlarının iki sırası da yalnız bir rezervasyonu kabul eder. Gerçek sayım/transfer çağrıları genel ve depo stok rezervasyonunu `active_hold_conflict` ile korur.
- Silinen mağaza siparişlerinin kişisel bilgileri operasyon tekrarlarında/slip kaydında da temizlenir; ödeme olguları ve toplamlar kalır. Özel fiyat kaynağı/sürüm kaydı değiştirilemez. Dokuz yeni tablo FORCE RLS ve doğrudan uygulama DML erişimi olmadan korunur.
- Bağımsız SQL/repository ve UI incelemeleri: açık P0/P1/P2 bulgu yok.
- Mevcut cashier rolü için 7 gerçek PostgreSQL senaryosu zorunlu test kaydına eklendi; kayıt kontrolleri 2/2.

## Canlı veritabanı ve yedek

- PostgreSQL 16.14, `celebix_saas_staging_auth01`. Geçiş öncesi: 10 mağaza, 1691 varyant, 19 sipariş. Prova kopyasındaki 25 önceki işlev tanımı ve beş kısıt canlıyla birebir karşılaştırıldı.
- Tam yayın öncesi yedek: `/data/celebix-release-backups/in_store_release_20260926_113957.dump`, 0600. SHA256: `262cd4e06ad860652709cb31b8e7ddfc0ecae2535608f730e432881cdc973f6c`.
- Provalarda kullanılan önceki yedek: `/data/celebix-release-backups/in_store_pre_20260926.dump`, SHA256 `1a5e333978f9a751b841092106d489120213e8edbe6d195e4a8d17fad63a98f3`.
- Canlı sırası başarıyla tamamlandı: **157 up → 157 assertions → 158 up → 158 assertions → 157 assertions**. Bağlantıda kilit timeout 5 s, sorgu timeout 120 s kullanıldı. Üretimde QA fixture/ödeme oluşturulmadı.
- 157 up SHA256: `0e977fbee77287339bcd0a7a7756cac8097464e29c1a4de512fd1ba716bc4ed3`.
- 158 up SHA256: `a0ab64541318b536a5fb0200199b1388e274e50c6e55e920004ac5f1c820942f`.

## Uygulama yayını

| Ortak uygulama | Coolify UUID | Deployment |
|---|---|---|
| Güzide / `.site` / özel admin alan adları | `yk1h6d97z7ex0h74ok3zrj5c` | `vh81nhl135cp57083mpvxc8j` |
| Siora / `.net` | `e4xe74cmii7jucbkyor0o412` | `b13sk8v6w995k5xghn1zhagw` |

İki yayın da tamamlandı: Güzide `11:58:24 UTC`, Siora `12:02:56 UTC`. Her iki uzak production build derleme, TypeScript ve statik sayfa üretiminden geçerek yeni container'a alındı.

Mevcut yayın öncesi/sonrası hook'lar, kapalı Auto/Preview Deploy, sağlayıcı kimlik bilgileri, onay modları ve build/runtime bayrakları korundu. `.site` PayTR bayrakları açık, `.net` bayrakları kapalı kalır; Iyzico authority eklenmez. Değişen yalnız sabit kaynak/dal, `SOURCE_COMMIT` ve aynı kaynak için hesaplanan iki mevcut PayTR digest değeridir. Resmi binding işlevleri ve ayrı hash hesabı eşleşti:

- Kaynak digest: `sha256:1a07a5b9de71c42f2c13e55cdd1a4d9f7741f87883199222723708ac2ede800d`.
- TEST: `sha256:fb87000a221f4709535d411aff76b8451e4180e94a4325db6d86164ac0cd52c8`.
- LIVE: `sha256:5d5c4fb933f328b93c181ac367bbf082c3089f61da25b29f95b2c05ae5f8f6d9`.
- Önceki TEST/LIVE: `sha256:95cbfd7120adce8c88f0441ac06c590ccd9885e6549bc1af5fa11bc548b1f261` / `sha256:fc9f721380dd06c24ba0922f1186ef504d0628b529674f0a5dd357d3153de77b`.
- Coolify önceki kaynak/binding yedekleri sunucudaki aynı yedek klasörüne 0600 ile alındı: `in-store-coolify-yk1h6d97z7ex0h74ok3zrj5c-20260926_115346.json`, `in-store-coolify-e4xe74cmii7jucbkyor0o412-20260926_115351.json`.

## Sınırlar ve geri dönüş

Yeni 98/99 başlangıçlı 13 rakamlı kodların EAN-13 kontrol hanesi geçerlidir; uygun okuyucu ve EAN-13/Code128 basılmış etikette kullanılabilir. Okuyucunun klavye modu ve Enter sonlandırması beklenir. Fiziksel okuyucu veya banka terminaliyle cihaz testi yapılmadı. Kodlar dahili kimliktir; küresel GS1 tahsis edilmiş GTIN olarak sunulmaz.

Mağaza sahibi/admin mevcut hesabıyla satış yapabilir. Dar kasiyer yetkisi, mevcut doğrulanmış SaaS cashier üyeliği ve etkin depo/indirim sınırı üzerinden çalışır; yeni personel kimliği davet/kayıt akışı bu sürümün kapsamı dışındadır. V1 taslakları denetim için tutar; ödenmemiş iptal aynı düzenlenebilir taslağa döner. TRY ve manuel tek POS ödemesi desteklenir; nakit, bölünmüş ödeme, offline satış/iade yoktur.

157/158 up dosyaları tekrar uygulanabilir değildir. Kalıcı POS verisi, fiyat kuralı, hareket veya cashier üyeliği oluşmadan guard'lar izin verirse **158 down → 157 down** mümkündür. Satış/veri oluştuktan sonra kayıtları koruyan ileri düzeltme gerekir; eski uygulama kaynağı yeni mağaza siparişlerini tanımayabilir. Yeni ödemeleri veya internet siparişlerini kaybettirecek tam yedek geri yüklemesi rutin geri dönüş değildir.

## Son canlı kabul

- Siora container `0700cf091378`, image `sha256:24e34265c70c20cc03ce332420ab9bdfeee9e3cbfa51d418c97bc7c9e8de8c51`.
- Güzide container `cd07a4df4c8a`, image `sha256:c9a304b796d3d4759081d19de2dd122ccab1ee28d0b74eda3bbad86fd41e22d4`.
- İki çalışan image tag, runtime `SOURCE_COMMIT`, PayTR TEST/LIVE ve Iyzico aday metadata SHA'ları yayın kaynağına eşit. Register sayfası, component, controller ve SQL157 dosya hash'leri checkout ile aynı; register ve eski bağlantı sayfaları compiled çıktıda mevcut. PayTR onayı yalnız önceki `.site` kapsamını korur, `.net` onayları boş; Iyzico onayı iki uygulamada da yoktur. [Çalışan kaynak kanıtı](evidence/in-store-sales-register/live-runtime.json).
- Dört admin alan adı (`guzide-kuyumcu-4.admin.saas-staging.celebix.site`, `admin.guzidekuyumcu.com.tr`, `admin.guzidekuyumcu.com`, `butik-siora.admin.saas-staging.celebix.net`) HTTP200, `status=ok`, Redis ready. Güzide/Siora storefront kökleri HTTP200. [Sağlık kanıtı](evidence/in-store-sales-register/live-health.json).
- Canlı SQL read-only karşılaştırması: 60 işlev tanımı ve izinleri, roller/politikalar/kısıtlar/tetikleyiciler son prova ile eşleşir; açık fark yoktur. [Veritabanı kanıtı](evidence/in-store-sales-register/live-database.json).
- Gerçek mevcut tarayıcı oturumlarıyla iki `/orders/quick-links` sayfası owner yetkisiyle açıldı. Depolar, satış yetkisi, boş sepet, manuel POS ve günlük özet hazır. Siora `SRA-2024` aramasında üç gerçek varyant, birer satılabilir adet ve 1990,00 TRY fiyatı görüntülendi; Güzide yüzük araması gerçek fiyat ve Ana Depo stoklarını gösterdi. Stoksuz Mağaza seçimi stok uydurmaz; sonuçlar engellidir. İki register tarayıcı console error/warn listesi boştur.
- Güzide `/orders/payment-links` eski formu, mevcut kredi/banka kartı seçeneği ve bağlantı listesiyle açıldı. Mevcut public bağlantı/API yolları değişmedi.
- Son canlı read-only sayımda mağaza satış/ödeme beyanı kayıtları 0, sipariş sayısı 19: kontrol sırasında merchant satış, rezervasyon veya tahsilat oluşturulmadı.
- İki yalnız QA veritabanı (`celebix_in_store_race_20260926`, `celebix_in_store_rehearsal_20260926`) kanıt alındıktan sonra kaldırıldı; tam yedekler korundu. Geçici bağlantı dosyaları ve QA tünelleri temizlendi.
