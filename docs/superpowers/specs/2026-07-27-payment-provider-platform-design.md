# Celebix Çoklu Ödeme Sağlayıcı Platformu Tasarımı

Status: Kullanıcı tarafından 2026-07-27 tarihinde onaylandı.

Implementation branch: codex/celebix-managed-umami-analytics

Implementation starting point: 6ccca303cd7b9189f8383c6d5ef77aab67033c20

Target surfaces:

- apps/customer-panel
- paylaşılan storefront checkout runtime'ı
- packages/saas-contracts
- packages/saas-data
- yeni additive SaaS migration'ları
- doğrudan kart verisi işlenecek aşama için ayrı deploy edilen ödeme runtime'ı

Reference package:

- /Users/Celebix/Downloads/gurmepos-pro
- POS Entegratör Pro 2.6.73
- yalnız protokol, alan ve davranış envanteri için okunur referans

## 1. Amaç

Celebix müşteri paneline ikas ödeme ayarlarının anlaşılır kullanım modelini izleyen, fakat Celebix'in kendi tasarım dili ve güvenlik sınırlarıyla çalışan çoklu ödeme sağlayıcı yönetimi eklenecektir.

Her Celebix müşterisi kendi banka veya ödeme kuruluşu sözleşmesini ve kendi entegrasyon bilgilerini kullanır. Celebix ortak bir ana üye işyeri hesabı, alt üye işyeri veya bütün mağazalar adına kullanılan tek bir ödeme hesabı sağlamaz.

Son ürün şunları sağlar:

- destek kapsamındaki tüm gerçek sağlayıcı aileleri ve entegrasyon modları logolarıyla katalogda görünür;
- mağaza sahibi sağlayıcı arayabilir, ayrıntısını görebilir ve hazır olan bağlantıyı adım adım kurabilir;
- kimlik bilgileri test ve canlı ortam için ayrı girilir, sunucuda şifrelenir ve sonradan geri okunamaz;
- bağlantı doğrulanmadan ödeme yöntemi etkinleştirilemez;
- etkin yöntemler ödeme adımında sürükle-bırak ile sıralanabilir;
- yöntem mağaza genelinde normal biçimde kapatılabilir veya olay anında acil duruma alınabilir;
- hosted redirect, iframe ve tokenized yöntemler önce; doğrudan banka POS yöntemleri izole PCI runtime'ında devreye alınır;
- ödeme başlatma, callback, webhook, doğrulama, iade, iptal ve mutabakat sonuçları sahte başarı üretmeden kayıt altına alınır.

## 2. Gözlenen ikas kullanım modeli

2026-07-27 tarihinde kullanıcının açık ve oturum açılmış ikas mağazası salt okunur olarak incelendi. Erişilebilen ödeme ekranında şu davranışlar doğrulandı:

- sayfanın üst bölümünde ayrı bir hızlı ödeme bilgi kartı;
- Ödeme Yöntemleri başlığı ve kısa açıklama;
- Önizleme ve Sıralama işlemi;
- Ödeme Yöntemi Ekle işlemi;
- yöntem listesinde Ödeme Yöntemleri, Acil Durum ve Durum alanları;
- mevcut yöntemde sağlayıcı türü ve Aktif durumu;
- önizleme penceresinde yöntemlerin sürükle-bırak ile sıralanması;
- değişiklik yokken Kaydet düğmesinin pasif olması;
- Vazgeç ile değişiklik yapmadan çıkış.

Referans mağazanın Start planı sağlayıcı ekleme kataloğunu lisans yükseltme penceresiyle kapattığı için ücretli sağlayıcı seçim ekranında hiçbir değişiklik veya yükseltme yapılmadı. Katalog tasarımı; erişilebilen ikas davranışı, ikas'ın resmi ödeme ayarları dokümantasyonu ve Celebix gereksinimleri birlikte kullanılarak tanımlandı.

Celebix ikas markalı Hızlı Öde veya ikas Cüzdan ürününü taklit etmez. Üst bilgi alanı Celebix'e ait ödeme kullanılabilirliği, bağlı yöntem sayısı, test/canlı durum ve müdahale gereken bağlantıları gösterir.

## 3. Kaynak paket incelemesi

GurmePOS Pro paketinde 59 ödeme gateway klasörü vardır. dummy-payment yalnız geliştirme/test adaptörüdür. Geri kalan 58 kayıt benzersiz kuruluş sayısı değildir; bazıları aynı sağlayıcının API nesli, hosted formu, iframe'i, cüzdanı veya alternatif ödeme modudur.

Örnek aile/mod ayrımları:

- Akbank ve Akbank JSON;
- QNB/Finansbank, PayFor ve PayFor v2;
- Garanti ve Garanti Pay;
- Halkbank ve MKD;
- İş Bankası ve Girogate;
- iyzico, iyzico iframe ve Pay with iyzico;
- Papara ve Papara Checkout;
- PayTR ve PayTR iframe;
- Ziraat Bankası, Ziraat Katılım ve ZiraatPay.

Paket WordPress ve WooCommerce yaşam döngüsüne, temel pos-entegrator eklentisine ve PHP sınıf kayıtlarına bağlıdır. Bu nedenle kod doğrudan Next.js/TypeScript runtime'ına kopyalanmayacaktır.

Paket şu konularda davranış referansıdır:

- sağlayıcı adları ve entegrasyon varyantları;
- yapılandırma alanları;
- test/canlı endpoint ayrımı;
- ödeme başlatma, callback, refund ve cancel kabiliyet işaretleri;
- sağlayıcıya özgü imza ve hata sınıflandırma ipuçları.

Güncel endpoint, algoritma, zorunlu alan, TLS, 3D Secure, callback ve imza kuralları için uygulama sırasında her sağlayıcının resmi ve güncel dokümantasyonu yetki kaynağıdır.

## 4. Seçenekler ve karar

### Seçenek A — Celebix'e özgü modüler sağlayıcı platformu

Seçilen yaklaşımdır. Görünür katalog, mağazaya ait bağlantı profili, ödeme yöntemi yapılandırması ve çalıştırılabilir adaptör registry'si birbirinden ayrılır. Böylece tüm sağlayıcılar baştan görülebilir; yalnız gerçekten doğrulanmış adaptörler bağlanabilir ve çalıştırılabilir.

Avantajları:

- tenant ve mağaza izolasyonu;
- sağlayıcı sürümlerinin bağımsız ilerletilmesi;
- aynı marka altındaki farklı entegrasyon modlarının doğru gösterilmesi;
- hosted ve doğrudan POS için ayrı PCI sınırı;
- test, izleme, acil kapatma ve mutabakatın merkezi olması;
- WordPress bağımlılığı olmadan uzun vadeli bakım.

### Seçenek B — WordPress/PHP kodunu doğrudan taşımak

Reddedildi. Kod mevcut uygulama modeline uymaz; WooCommerce callback, session, hook ve veritabanı varsayımları taşır. Paket sürümündeki endpoint ve güvenlik kabullerini olduğu gibi üretime almak da doğrulanmamış davranış yaratır.

### Seçenek C — Tek bir ödeme orkestratörüne bağlanmak

Reddedildi. İlk geliştirme daha kısa olsa da müşterilerin kendi banka ve sağlayıcı sözleşmelerini doğrudan kullanması hedefini karşılamaz; tek sağlayıcı bağımlılığı ve ek komisyon/sözleşme sınırı oluşturur.

## 5. Yönetim paneli deneyimi

### 5.1 Sayfa kabuğu

/settings/payment gerçek bir ödeme yönetim ekranına dönüşür. Generic MerchantModuleConsole ödeme sayfasında kullanılmaz.

Sayfa:

- mevcut Celebix ana panel kabuğunu ve daha önce eklenmiş responsive dropdown yan panel davranışını korur;
- üstte her ayar sayfasında kullanılabilen sabit başlık/işlem alanını kullanır;
- sipariş kısayolu veya sağda yüzen ikas butonlarını kopyalamaz;
- mobil ve masaüstünde aynı yetki ve durum doğruluğunu korur;
- kaydedilmemiş değişiklik varken açık uyarı ve güvenli Vazgeç akışı sunar.

### 5.2 Üst durum kartı

İkas'ın markalı hızlı ödeme kartı yerine Celebix'e ait operasyon özeti bulunur:

- ödeme almaya hazır / müdahale gerekli / test modu;
- aktif yöntem sayısı;
- doğrulama bekleyen bağlantı sayısı;
- son başarısız callback veya provider outage özeti;
- yalnız gerçek veriye dayalı eylem bağlantısı.

Boş veya henüz desteklenmeyen veri için sıfır yerine sahte başarı, kazanç veya kullanılabilirlik gösterilmez.

### 5.3 Etkin ödeme yöntemleri listesi

Liste satırı şu alanları gösterir:

- sağlayıcı logosu;
- mağazaya özel görünen ad;
- sağlayıcı ailesi ve entegrasyon modu;
- test veya canlı ortam rozeti;
- bağlantı durumu;
- ödeme adımında etkin/pasif durumu;
- acil durum durumu;
- son başarılı doğrulama zamanı;
- Düzenle ve diğer güvenli işlemler menüsü.

Normal devre dışı bırakma ödeme yöntemini checkout'tan kaldırır. Acil durum kapatma ayrıca olay kaydı üretir, yüksek görünürlüklü uyarı gösterir ve bağlantı kimlik bilgilerini silmeden yeni ödeme başlatmalarını anında durdurur.

### 5.4 Sağlayıcı kataloğu

Ödeme Yöntemi Ekle, modal veya drawer içinde aranabilir kart kataloğu açar. Her kartta:

- resmi logo;
- sağlayıcı adı;
- tür: banka POS, ödeme kuruluşu, cüzdan, alternatif yöntem veya uluslararası;
- mevcut modlar: redirect, iframe, tokenized, direct POS;
- taksit, 3D Secure, refund, cancel ve capture kabiliyetleri;
- ürün durumu;
- ayrıntı ve bağlan eylemi bulunur.

Filtreler en az tür, entegrasyon modu, canlı hazır olma durumu ve test ortamı desteğini kapsar.

Tüm gerçek sağlayıcı aileleri görünür olur. Ürün durumu açık biçimde ayrılır:

- Canlı kullanıma hazır;
- Test ortamı hazır;
- Doğrulama aşamasında;
- Hazırlanıyor;
- Geçici bakımda.

Hazırlanıyor veya doğrulama aşamasındaki kart gösterilir ancak kimlik bilgisi toplamaz ve etkinleştirilemez. Kullanıcıya yanlış bir çalışan entegrasyon izlenimi verilmez.

dummy-payment yalnız test bundle'ında bulunur; production katalog, API ve browser DTO'sunda hiçbir zaman görünmez.

### 5.5 Bağlantı sihirbazı

Hazır bir kart seçildiğinde adımlı drawer açılır:

1. Sağlayıcı ve entegrasyon modu özeti.
2. Test veya canlı ortam seçimi.
3. Sağlayıcıya özgü public alanlar ve secret alanları.
4. Kopyalanabilir Celebix callback/webhook adresleri ve sağlayıcı panelinde yapılacaklar.
5. Bağlantıyı Test Et.
6. Taksit, 3D Secure, checkout etiketi ve operasyon ayarları.
7. Özet ve Etkinleştir.

Alan şeması adapter tanımından gelir; serbest anahtar-değer editörü kullanılmaz. Secret alanı gönderildikten sonra geri dönmez. Düzenlemede yalnız maskeli hesap referansı ve secret'ın kayıtlı olduğu bilgisi görünür; değiştirmek yeni credential version oluşturur.

Bağlantı testi yalnız kimlik bilgisi ve sağlayıcı erişimini doğrular. Gerçek tahsilat yapılması gerekiyorsa bunun tutarı, test kartı ve geri alma davranışı açık bir ayrı onay akışına sahip olur.

### 5.6 Önizleme ve sıralama

İkas'taki model Celebix'e uyarlanır:

- yöntemler sürükle-bırak ve klavye kontrolleriyle sıralanabilir;
- sağda veya altında checkout önizlemesi güncellenir;
- yalnız değişiklik varsa Kaydet etkinleşir;
- stale version çatışması durumunda kullanıcıya yeniden yükleme sunulur;
- sıralama mağaza bazındadır;
- aktif olmayan veya acil kapalı yöntem checkout önizlemesinde seçilebilir görünmez.

## 6. Katalog, bağlantı ve çalışma durumunun ayrılması

Tek bir status alanı bütün anlamları taşımayacaktır.

### 6.1 ProviderCatalogEntry

Kodla sürümlenen, secret içermeyen ürün kataloğudur:

- provider family code;
- mode code;
- label ve arama alias'ları;
- logo asset metadata;
- kategori ve ülke;
- interaction mode;
- capability set;
- required field schema;
- official documentation links;
- catalog readiness;
- adapter version;
- ortam desteği.

Görünür katalog mevcut MerchantProviderRegistry'nin 64 çalıştırılabilir entry sınırına bağlanmaz. Katalog ile executable registry ayrı olduğundan bütün sağlayıcılar görünür olabilir ve üretim registry'si yalnız doğrulanmış adaptörleri barındırır.

### 6.2 MerchantProviderProfile

Mevcut sealed credential foundation genişletilir. Profil:

- server-derived store ID;
- provider family ve mode;
- test/canlı ortam;
- public configuration;
- sealed credential envelope;
- maskeli hesap referansı;
- credential version ve key ID;
- pending_validation, active, disabled, rotation_required veya revoked durumu;
- son doğrulama sonucu ve zamanı

tutar.

Browser plaintext credential, ciphertext, provider raw yanıtı veya tenant authority alamaz.

### 6.3 StorePaymentMethod

Profilin checkout'ta nasıl kullanılacağını tanımlar:

- store-scoped payment method ID;
- profile ID;
- görünen ad;
- etkinlik;
- emergency disabled durumu ve nedeni;
- sıralama konumu;
- checkout açıklaması;
- 3D/taksit tercihleri;
- optimistic version;
- created/updated timestamps.

Generic payment_setting kaydı yeni bağlantılar için otorite değildir. Mevcut kapıda ödeme ayarı additive migration ile first-class offline method'a dönüştürülür; eski kayıt geçiş süresince yalnız uyumluluk okuması için kullanılır ve sonra kaldırılır.

### 6.4 PaymentAttempt ve PaymentEvent

Her ödeme başlatması store, order/cart snapshot, yöntem, provider mode, integer minor amount, currency, Celebix idempotency key ve güvenli provider reference ile kalıcılaştırılır.

Durumlar:

- created;
- awaiting_customer;
- submitted;
- provider_outcome_unknown;
- authorized;
- captured;
- failed;
- cancelled;
- partially_refunded;
- refunded;
- expired;
- reconciliation_required.

PaymentEvent append-only audit kaydıdır. Raw kart verisi, CVV, full provider body, credential, cookie, authorization header veya kişisel veri içeren kontrolsüz payload saklanmaz.

## 7. Runtime mimarisi

### 7.1 Yönetim control plane

apps/customer-panel:

- session ve TenantContext ile mağaza/yetkiyi çözer;
- katalog ve maskeli bağlantı DTO'larını sunar;
- exact schema ile credential mutasyonu kabul eder;
- credential'ı mevcut injected sealer ile envelope'a dönüştürür;
- validate, activate, disable, emergency disable, rotate, reorder ve revoke komutlarını yönetir;
- ödeme sağlayıcısına browser üzerinden doğrudan secret göndermez.

configuration.manage gerekli asgari izindir. Database fonksiyonları da aynı rol kararını uygular.

### 7.2 Hosted ödeme data plane

Redirect, iframe veya provider-tokenized ödeme başlatma public storefront sunucusundan yapılır:

1. Store doğrulanmış hostname ve server-side checkout/cart üzerinden çözülür.
2. Fiyat, currency, ürün ve yöntem yeniden doğrulanır.
3. PaymentAttempt ve operation ID oluşturulur.
4. Aktif profilin immutable credential version snapshot'ı alınır.
5. Adapter exact allowlist endpoint'e bounded çağrı yapar.
6. Browser yalnız provider tarafından güvenli kabul edilen redirect URL, form alanları veya public token alır.
7. Sonuç callback/webhook ve gerektiğinde status reconciliation ile kesinleştirilir.

Browser'ın başarılı dönüş sayfası tek başına ödeme başarısı sayılmaz.

### 7.3 Doğrudan banka POS data plane

PAN veya CVV'nin Celebix kontrolündeki bir forma girdiği yöntemler customer-panel ya da genel storefront Node runtime'ında açılmaz. Ayrı deploy edilen ödeme runtime'ı gerekir:

- ayrı network, secret, log ve erişim politikası;
- en az ayrı service identity ve database function surface;
- cardholder data'nın log, trace, error, analytics ve genel event bus'a girmesini engelleyen kontroller;
- CVV'nin hiçbir durumda kalıcılaştırılmaması;
- hassas PAN kullanımının tokenization veya sağlayıcıya anlık iletimle sınırlandırılması;
- üretim açılışından önce uygulanabilir PCI DSS kapsam doğrulaması, ASV/penetration bulguları ve operasyon runbook'u.

Kod tasarımı PCI uyumluluğu iddiası değildir. Direct POS adaptörü bu dış doğrulama tamamlanmadan katalogda Hazırlanıyor kalır.

### 7.4 Callback, webhook ve dönüş

Callback URL mağazayı browser body/header değerinden seçmez. Store ve profile authority; route'taki provider code ile birlikte tahmin edilemez, rotatable callback binding üzerinden çözülür.

Her callback:

- exact method ve bounded content type/body;
- provider-specific imza/MAC doğrulaması;
- timestamp/nonce/replay kontrolü varsa zorunlu uygulama;
- amount, currency, order/attempt ve merchant reference eşleştirmesi;
- aynı olay için idempotent sonuç;
- unknown attempt ve cross-store referanslarında fail-closed;
- güvenli, provider'a uygun HTTP cevabı

uygular.

Redirect dönüşü kullanıcı deneyimini tamamlar; webhook/callback veya resmi status query finansal otoritedir.

### 7.5 Refund, cancel, capture ve reconciliation

Her yetenek adapter capability setinde ayrı tanımlanır. UI desteklenmeyen eylemi gizlemekle yetinmez; server ve database de reddeder.

Provider write isteğinden sonra timeout veya bağlantı kopması otomatik tekrar edilmez. Sonuç provider_outcome_unknown olur ve salt-okunur status query/reconciliation çalışır. Native idempotency destekleyen sağlayıcıda aynı Celebix operation key yeniden kullanılır.

## 8. Logo ve marka varlığı politikası

İnternet araması yalnız resmi kaynağı bulmak için kullanılır. Öncelik sırası:

1. sağlayıcının resmi brand/press kit'i;
2. resmi geliştirici veya ürün dokümantasyonu;
3. sağlayıcının resmi web sitesindeki kullanılabilir marka varlığı;
4. resmi varlık bulunamazsa lisans durumu doğrulanmış güvenilir kaynak;
5. kullanım izni doğrulanamazsa zararsız Celebix monogram placeholder.

Hotlink yapılmaz. Dosyalar repository'de yerel ve immutable asset olarak tutulur. Her varlık için manifest kaydı bulunur:

- provider family code;
- source URL;
- retrieved date;
- source/usage note;
- original ve optimized checksum;
- mime type ve ölçüler;
- light/dark varyant bilgisi.

SVG dosyaları script, event handler, external reference, foreignObject ve gömülü aktif içerikten arındırılır; raster dosyalar metadata ve boyut sınırlarından geçirilir. Aynı sağlayıcının modları aynı resmi logoyu ve farklı mod rozetini kullanabilir.

## 9. Hata ve operasyon modeli

Kullanıcıya gösterilen sabit sınıflar:

- kimlik bilgisi geçersiz;
- sağlayıcı erişilemiyor;
- callback yapılandırması eksik;
- imza doğrulanamadı;
- sağlayıcı işlemi reddetti;
- oran sınırı;
- geçici hata, güvenli tekrar mümkün;
- sonuç belirsiz, mutabakat gerekli;
- yöntem acil durumda;
- entegrasyon henüz hazır değil.

Raw sağlayıcı hata gövdesi kullanıcıya veya loga verilmez. Güvenli provider code, bounded error class, request/operation ID, attempt ID ve timestamp gözlemlenebilirlik için yeterlidir.

Her provider için circuit breaker ve oran sınırlama politikası bulunur. Platform genelindeki acil kapatma provider/mode bazında uygulanabilir; mağaza acil kapatması yalnız ilgili store method'unu etkiler.

## 10. Sağlayıcı teslim sırası

Son hedef plugin envanterindeki bütün gerçek sağlayıcı/modların doğrulanmış adaptörleridir. Görünür katalog ilk dilimde tamamlanır; çalıştırılabilirlik dalgalar halinde açılır.

### Dalga 0 — Platform ve katalog

- normalized provider family/mode kataloğu;
- tüm logolar ve asset manifesti;
- ikas modeline uyarlanmış ödeme ayarları UI;
- connection wizard;
- profile encryption/rotation;
- method state, emergency toggle ve ordering;
- fake adapter yalnız testlerde;
- production adapter registry varsayılan boş/fail-closed.

### Dalga 1 — Mevcut ve hosted-first yollar

- Celebix'te halen gerçek kullanım izi bulunan PayTR yolunun ortak runtime'a taşınması;
- PayTR iframe;
- iyzico hosted/iframe/Pay with iyzico;
- Craftgate;
- Paynet/varsa mevcut Celebix uyumluluk yolu;
- Shopier;
- Papara Checkout.

Kesin Dalga 1 kapsamı resmi sandbox ve hesap erişimiyle doğrulanır; doğrulanamayan sağlayıcı görünür kalır fakat açılmaz.

### Dalga 2 — Diğer hosted ödeme kuruluşları ve cüzdanlar

- sağlayıcı resmi dokümantasyonu ve sandbox'ı olan redirect/iframe/token tabanlı modlar;
- provider bazlı refund/cancel/status query;
- callback conformance paketi.

### Dalga 3 — Doğrudan banka POS

- ayrı PCI runtime;
- banka grupları için adapter conformance;
- 3D Secure ve non-3D politika kontrolü;
- taksit matrisi;
- production öncesi güvenlik ve operasyon kapıları.

Bir dalgada bulunmak nihai kapsam dışı anlamına gelmez. Bütün gerçek provider/modlar üretim doğrulaması tamamlandıkça Canlı kullanıma hazır durumuna geçirilir.

## 11. API ve veri sözleşmesi ilkeleri

Kesin route adları uygulama planında mevcut HTTP modülleriyle birlikte sabitlenecektir. Sözleşme aileleri:

- katalog liste/detay;
- profile liste/oluştur/validate/rotate/disable/revoke;
- method liste/oluştur/güncelle/emergency/reorder;
- checkout payment session create/status;
- provider callback/webhook/return;
- payment attempt detail;
- refund/cancel/capture;
- reconciliation.

Kurallar:

- browser tenant/store ID göndermez;
- admin mutation'ları exact same-origin ve CSRF kontrolü ister;
- public checkout authority doğrulanmış host ve server-side cart/order'dan gelir;
- callback authority opaque binding ve provider imzasından gelir;
- tüm mutable command'lar operation ID, fingerprint ve optimistic version kullanır;
- response DTO'ları secret/private authority taramasından geçer;
- listeler bounded ve deterministik sıralıdır;
- amount integer minor unit ve ISO currency olarak taşınır.

## 12. Test stratejisi

Her dilim RED -> GREEN -> REFACTOR ile uygulanır.

### Contract ve katalog

- bütün provider/mode code'ları benzersiz;
- dummy production bundle'da yok;
- katalog her gerçek plugin varyantını bir family/mode'a bağlar;
- logo asset ve manifest bütünlüğü;
- secret alanlarının DTO'ya sızmaması;
- readiness ve capability tutarlılığı.

### Database ve repository

- migration apply/assert/rollback/reapply;
- tenant/store izolasyonu;
- direct DML/grant reddi;
- idempotency, stale version ve replay mismatch;
- reorder concurrency;
- aynı store/mode için aktif profil invariant'ı;
- event append-only;
- cross-store ID reddi.

### Adapter conformance

Her sağlayıcı için ortak test suite:

- credential/config parser;
- test/canlı endpoint allowlist;
- success, decline ve malformed response;
- timeout before write ve unknown after write;
- redirect reddi/izinli dönüş doğrulaması;
- signature/MAC fixtures;
- duplicate callback ve callback sırası yarışları;
- amount/currency/order mismatch;
- refund/cancel/capture capability;
- log/DTO secret scan.

Resmi sandbox testi gerçek adapter'ın production-ready kapısıdır. Fixture testi tek başına Canlı kullanıma hazır durumu vermez.

### UI ve erişilebilirlik

- loaded, empty, loading, error ve permission durumları;
- search/filter ve bütün logo fallback'leri;
- connection wizard keyboard/focus davranışı;
- secret mask/rotation;
- test connection sonuçları;
- emergency confirmation;
- drag/drop ve klavye sıralama;
- mobile dropdown sidebar regresyonu;
- fixed header ve unsaved-change davranışı;
- checkout preview doğruluğu.

### Uçtan uca ve güvenlik

- mağaza A credential/method/attempt verisi mağaza B'ye görünmez;
- hosted ödeme başlatma ve doğrulanmış callback;
- sahte browser success'in siparişi ödenmiş yapmaması;
- callback replay ve cross-store binding reddi;
- CSP/frame/connect origin kısıtları;
- body/timeout/response byte sınırları;
- secret, PAN ve CVV log taraması;
- provider outage ve reconciliation;
- full customer-panel test, typecheck, production build ve mevcut phase regresyonları.

## 13. Dağıtım ve aktivasyon

- migration'lar additive uygulanır;
- katalog UI önce deploy edilebilir fakat bütün çalıştırılabilir adaptörler environment activation ile varsayılan kapalıdır;
- provider/mode yalnız contract, sandbox, callback, güvenlik ve operasyon testleri geçince açılır;
- test ve canlı aktivasyon ayrı flag'dir;
- production credential girilmesi veya gerçek para tahsilatı bu tasarım onayıyla otomatik olarak yetkilendirilmiş değildir;
- Coolify deploy sonrası health, panel auth, katalog, tenant izolasyonu ve checkout smoke testleri çalıştırılır;
- adapter bazında rollback/circuit-breaker runbook'u hazırlanır.

## 14. Tamamlanma ölçütü

Platform tamamlanmış sayılmak için:

- plugin paketindeki dummy dışındaki her gateway varyantı normalize bir katalog family/mode kaydına bağlı olmalı;
- bütün katalog kartlarında doğrulanmış yerel logo veya açık fallback bulunmalı;
- bütün gerçek sağlayıcılar görünür ve durumları doğru olmalı;
- bütün hedef sağlayıcı/modlar resmi dokümana göre uygulanmış ve provider conformance kapısını geçmiş olmalı;
- her mağaza yalnız kendi sözleşme ve credential'ını kullanmalı;
- hosted ve direct POS PCI sınırları karışmamalı;
- CVV hiçbir yerde saklanmamalı;
- ödeme başarısı yalnız doğrulanmış provider otoritesinden gelmeli;
- emergency disable ve checkout sıralaması tenant-safe çalışmalı;
- admin UI ikas'ın anlaşılır modelini karşılamalı, Celebix dropdown sidebar ve sabit üst yapı regresyon yaşamamalı;
- bütün güvenlik, migration, UI, checkout, build ve canlı smoke testleri geçmeli;
- apps/admin donor ağacı değişmeden kalmalı.

## 15. Resmi referanslar

- ikas ödeme ayarları: https://support.ikas.com/tr/odeme-ayarlari
- PCI DSS belge kütüphanesi ve SAQ A: https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf
- PCI DSS SAQ D Merchant: https://listings.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-D-Merchant.pdf
- POS Entegratör destek merkezi: https://support.posentegrator.com/

Sağlayıcıya özgü resmi dokümantasyon ve logo kaynakları uygulama planındaki provider inventory görevinde tek tek kaydedilecektir.
