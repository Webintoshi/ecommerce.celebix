# Standart Checkout Hosted Kart Ödemesi Tasarımı

**Durum:** Kullanıcı tarafından yaklaşım 2026-08-06 tarihinde onaylandı; ayrıntılı tasarım kullanıcı incelemesini bekliyor.

**Tasarım tabanı:** `8bcdf8d6cbea15788ab10b49a5916d0ed02fb37e`

**Hedef yüzeyler:**

- `apps/storefront-shared`
- `packages/saas-contracts`
- `packages/saas-data`
- `apps/owner/scripts/sql/saas`
- yalnız gerçek provider durumu göstermek için gereken sınırlı `apps/customer-panel` olgunluk güncellemesi

## 1. Amaç

Standart mağaza sepeti ve tek sayfalık checkout, mağazanın etkin hosted ödeme sağlayıcısıyla gerçek kart ödemesi alacaktır. İlk çalıştırılabilir sağlayıcılar mevcut ve ayrı ayrı doğrulanan `paytr_iframe` ile `iyzico_iframe` adaptörleridir.

Mağazalar kendi sağlayıcı sözleşmesini ve kendi şifrelenmiş kimlik bilgilerini kullanmaya devam eder. Sistem aynı mağazada aynı anda yalnız bir hosted sağlayıcının etkin olmasına izin veren mevcut veritabanı kuralını korur.

Teslimat şunları sağlar:

- standart checkout'ta etkin provider için tek bir sade “Kredi veya banka kartı” seçeneği;
- fiyat, kargo, stok, yöntem ve provider yetkisinin PostgreSQL tarafından yeniden doğrulanması;
- ödeme boyunca süreli stok rezervasyonu;
- PayTR veya iyzico'nun doğrulanmış hosted ekranına güvenli geçiş;
- browser dönüşünden bağımsız callback ve reconciliation doğrulaması;
- başarılı tahsilatta tek ve atomik sipariş oluşturma;
- kesin başarısızlıkta stok rezervasyonunu bırakma;
- belirsiz sonuçta sahte başarı ya da kör tekrar üretmeme;
- misafir checkout, müşteri hesabı, havale ve kapıda ödeme davranışını koruma.

Bu çalışma doğrudan kart numarasını Celebix'e almaz, yeni provider adaptörü yazmaz, refund özelliği eklemez ve aynı mağazada birden fazla hosted sağlayıcıyı eşzamanlı etkinleştirmez.

## 2. Doğrulanan mevcut durum

Kod denetiminde aşağıdaki sınırlar doğrulanmıştır:

1. `saas.storefront_payment_methods_projection` yalnız `bank_transfer` ve `cash_on_delivery` yöntemlerini public checkout'a yansıtır.
2. `CheckoutForm` ve storefront commerce sözleşmesi yalnız bu iki ödeme türünü kabul eder.
3. Standart checkout siparişi doğrudan oluşturur; hosted provider başlatma, callback veya ödeme sonucu bekleme aşaması yoktur.
4. PayTR ve iyzico için generic `HostedPaymentRuntime`, provider-specific adapter'lar, sealed merchant credential, callback binding, payment attempt state machine ve reconciliation temeli vardır.
5. Bu generic hosted runtime standart sepette kullanılmaz. Çalışan köprü yalnız token-bound hızlı sipariş bağlantısı akışındadır.
6. Standart offline checkout, ürün varyantlarını `FOR UPDATE` ile kilitler; stok yeterliyse aynı transaction içinde sipariş oluşturur ve stoğu düşer. Mevcut offline akış çift satışa karşı temel atomik korumaya sahiptir.
7. `checkout_inventory_reservations` tablosu generic `payment_attempt_id` sahipli rezervasyonları destekler; ancak standart sepet hosted ödemesi bu otoriteye bağlı değildir.

Sonuç olarak panelde etkinleştirilebilen PayTR/iyzico sağlayıcısı standart mağaza checkout'unda müşteriye kart ödeme seçeneği sağlamamaktadır. Bu tasarım o yanıltıcı ürün boşluğunu kapatır.

## 3. Değerlendirilen yaklaşımlar

### A — Hızlı sipariş akışını standart checkout'a yönlendirmek

Reddedildi. Hızlı sipariş akışı merchant tarafından hazırlanmış link, redemption session, link snapshot ve hızlı sipariş order referansına bağlıdır. Normal sepeti bu modele sıkıştırmak yanlış yaşam döngüsü, bozuk hesap erişimi ve ileride kampanya/kargo sorunları üretir.

### B — PayTR ve iyzico için ayrı standart checkout yolları

Reddedildi. Fiyat/stok/teslimat/order kodunu sağlayıcı başına çoğaltır; callback, timeout ve idempotency davranışları zamanla ayrışır. Kullanıcının tek aktif sağlayıcı kuralını korusa bile bakım ve finansal hata riskini büyütür.

### C — Provider'dan bağımsız standart checkout ödeme otoritesi

Seçilen yaklaşımdır. Standart sepet için ayrı, store-scoped bir hosted checkout session/bridge eklenir; ödeme yürütme mevcut generic payment attempt ve adapter runtime'ına bırakılır. Böylece commerce snapshot ve stok rezervasyonu sağlayıcıdan bağımsız, imza/endpoint davranışı ise provider adaptöründe kalır.

## 4. Değişmez kurallar

1. Store kimliği yalnız doğrulanmış storefront hostname üzerinden çözülür; browser store veya tenant ID gönderemez.
2. Tutar, indirim, kargo, stok, para birimi, payment method, provider profile ve execution authority browser girdisi değildir.
3. Kart verisi Celebix formuna veya sunucusuna girmez; yalnız sağlayıcının doğrulanmış hosted yüzeyinde işlenir.
4. Ödeme yalnız generic runtime'ın doğrulanmış `captured` sonucu ile başarılı sayılır.
5. Browser success return, query parametresi, iframe mesajı veya müşteri ekranı tek başına ödeme kanıtı değildir.
6. Provider callback'i tek başına sipariş tablosunu doğrudan değiştirmez; payment attempt sonucundan idempotent bridge finalizer çalışır.
7. Aynı checkout operation/fingerprint tekrarı aynı session sonucunu döndürür; farklı payload ile tekrar reddedilir.
8. Bir payment attempt en fazla bir standart checkout session'a ve bir siparişe bağlanır.
9. Bir cart/buy-now intent için aynı anda en fazla bir aktif hosted session bulunur.
10. Offline yöntemler mevcut atomik `public_checkout_complete` yolunda çalışmaya devam eder.
11. Hosted provider yoksa kart seçeneği gösterilmez; offline yöntem varsa checkout kullanılabilir kalır.
12. Provider execution authority, credential version veya aktif yöntem durumu uyuşmazsa başlatma fail-closed olur.

## 5. Veri modeli

Additive migration mevcut tabloları yeniden anlamlandırmadan yeni standart checkout bridge otoritesini ekler.

### 5.1 `storefront_hosted_checkout_sessions`

Her satır tek bir standart cart veya buy-now ödemesini temsil eder:

- `id`, `store_id`;
- tam olarak biri dolu `cart_id` veya `intent_id`;
- `payment_attempt_id`, `payment_method_id`, `profile_id`, `provider_code`;
- provider başlatılırken sabitlenen environment, credential version, adapter version ve evidence digest;
- server-derived `order_reference` ve önceden ayrılmış order/customer/address/event/receipt kimlikleri;
- cart version ve commerce authority digest;
- para birimi, subtotal, shipping, discount ve total minor-unit değerleri;
- teslimat/customer snapshot'ının gerekli ve sınırlandırılmış alanları;
- ödeme sonrası sipariş üretmek için canonical item snapshot;
- `active`, `provider_ready`, `processing`, `captured`, `failed`, `expired`, `stock_conflict` durumları;
- stok hold bitiş zamanı, terminal zamanı ve version;
- browser-bound payment-session credential digest/key ID;
- receipt ve customer credential key/digest otoritesi.

Session snapshot ham provider response, secret, Authorization başlığı, kart verisi veya browser tarafından hesaplanmış toplam içermez.

### 5.2 Stok rezervasyonları

Mevcut `checkout_inventory_reservations` tablosunun generic `payment_attempt_id` sahibi kullanılır; ancak tablo bugün `quick_order_link_id` alanını zorunlu tuttuğu için standart checkout'a olduğu gibi kullanılamaz. Additive migration:

- mevcut hızlı sipariş satırlarının anlamını ve foreign key'lerini korur;
- `quick_order_link_id` alanını yalnız yeni standart checkout satırları için nullable yapar;
- nullable `storefront_hosted_session_id` alanı ve store-scoped foreign key ekler;
- her rezervasyonun ya hızlı sipariş linkine ya standart hosted session'a bağlı olmasını, ikisine birden veya hiçbirine bağlı olmamasını constraint ile engeller;
- legacy `attempt_id` ile generic `payment_attempt_id` tek-sahip kuralını korur;
- standart session/payment-attempt/variant için ayrı partial unique index ekler.

Bu değişiklik hızlı sipariş rezervasyonlarını yeni modele taşımaya çalışmaz ve onların çalışan settlement yolunu değiştirmez.

- Başlatmada varyant satırları deterministik sırayla kilitlenir.
- Kullanılabilir stok `stock_quantity - diğer aktif rezervasyonlar` üzerinden hesaplanır.
- Tek bir canonical kullanılabilir-stok SQL helper'ı cart add/update, buy-now, public cart projection, quote, offline complete ve hosted start yollarında kullanılır. Böylece havale/kapıda ödeme checkout'u hosted kart için ayrılmış stoğu tüketemez.
- Bir hosted session kendi rezervasyonunu yeniden doğrularken yalnız kendi hold miktarını hesap dışı bırakır; başka session hold'ları her zaman düşülür.
- Her takip edilen varyant için bir `held` rezervasyon yazılır.
- Capture finalizer rezervasyonu `consumed` yapar ve fiziksel stoğu aynı transaction içinde düşer.
- Kesin failure/cancel/expiry rezervasyonu `released` veya `expired` yapar.
- Stok takibi kapalı varyant için gereksiz rezervasyon yazılmaz.

Hold süresi kodla sabitlenen 15 dakikadır; merchant/browser tarafından değiştirilemez. Provider sonucu belirsizse normal expiry önce reconciliation talep eder. Hard expiry sonrasında gelen doğrulanmış capture stok tekrar satılmışsa sessizce sipariş oluşturmaz; `stock_conflict` üretir, payment attempt captured kalır ve yönetici müdahalesi gerektirir.

### 5.3 Operation kayıtları

Başlatma, presentation persistence, terminal finalization ve expiry işlemleri ayrı replay-safe operation kayıtları kullanır. Operation payload fingerprint'i en az şu gerçekleri kapsar:

- hostname/store bağlamı;
- cart veya intent credential adayları ve version;
- canonical delivery snapshot;
- seçilen payment method ID;
- fiyat/kargo/item authority digest;
- customer/receipt credential authority;
- operation ID.

Commit sonucu belirsizse yalnız operation lookup ile recovery yapılır; provider initialization kör biçimde tekrarlanmaz.

## 6. Public sözleşmeler

### 6.1 Payment method projection

`PublicCheckoutPaymentMethod` ayrımı genişler:

- `bank_transfer`;
- `cash_on_delivery`;
- `hosted_card`.

Hosted projection yalnız şu public alanları taşır:

- sabit `kind: "hosted_card"`;
- payment method ID;
- mağazanın belirlediği güvenli label;
- provider logo/etiketi için provider code;
- checkout'ta gereken ek müşteri alanlarının finite listesi;
- `redirect` veya `iframe` sunum türü.

Profile ID, credential version, evidence digest, sealed credential ve callback binding browser'a çıkmaz.

### 6.2 Quote

Quote, aktif offline yöntemlerle birlikte en fazla bir hosted yöntemi yansıtır. Hosted yöntem ancak aşağıdakilerin tamamı doğruysa görünür:

- payment method `active`;
- aynı mağazada başka aktif provider yok;
- provider profile `active`;
- credential ve execution environment eşleşiyor;
- exact compiled execution authority/evidence doğrulanıyor;
- current packet bu provider/environment'i gerçekten çalıştırabiliyor.

Kart sağlayıcısı geçici olarak çalıştırılamıyorsa kart seçeneği sessizce başarılı gösterilmez. Offline yöntemler varsa kalır; hiç yöntem yoksa canonical `payment_unavailable` sonucu döner.

### 6.3 Checkout başlatma

Offline complete sözleşmesi korunur. Hosted kart için yeni exact same-origin endpoint kullanılır:

- `POST /api/checkout/payment/start`

Gövde yalnız operation ID, cart version, intent kind, delivery/contact alanları, seçilen public payment method ID ve provider'ın açıkça zorunlu tuttuğu ek müşteri alanlarını içerir. JSON UTF-8 ve byte sınırı uygulanır; unexpected alan reddedilir.

Başarılı yanıt provider URL'si veya token'ı döndürmez. Server kısa ömürlü HttpOnly/Secure/SameSite=Lax payment-session cookie yazar ve yalnız same-origin `/checkout/payment` destination döndürür.

### 6.4 Presentation route

`GET /checkout/payment` yalnız doğrulanmış payment-session cookie ile çalışır:

- session `provider_ready` ise server-side sealed presentation açılır;
- redirect sağlayıcıda exact HTTPS origin/path/query allowlist doğrulanır ve `303` yapılır;
- iframe sağlayıcıda CSP yalnız gereken exact provider frame origin'ine daraltılır;
- processing durumunda güvenli bekleme yüzeyi gösterilir;
- terminal/expired/invalid durumda provider ayrıntısı sızdırmadan checkout sonuç sayfasına yönlendirilir.

Provider presentation token/url kısa ömürlü, digest-bound sealed envelope olarak session'a bağlı saklanır. Raw presentation URL log, analytics, RSC veya müşteri paneli DTO'suna yazılmaz.

## 7. Başlatma akışı

1. Route exact host/origin/path/method/content-type/body/cookie sınırlarını doğrular.
2. PostgreSQL cart veya buy-now credential'ını, version'ı ve mağazayı çözer.
3. Fiyatlar, ürün/variant durumu, kargo ve tek aktif hosted yöntem yeniden doğrulanır.
4. Gerekli provider müşteri alanları doğrulanır. iyzico için gerçek ve geçerli kimlik alanı yoksa sahte değer üretilmez; form eyleme dönük validation hatası gösterir.
5. Varyantlar kilitlenir, kullanılabilir stok hesaplanır ve 15 dakikalık rezervasyon oluşturulur.
6. Session, generic payment attempt ve callback binding aynı veritabanı otoritesiyle oluşturulur.
7. Veritabanı transaction'ı kapanır; provider network çağrısı transaction/row lock açıkken yapılmaz.
8. Mevcut provider adapter kendi sealed credential'ını açar ve initialize isteğini yapar.
9. Kesin provider reddinde attempt/session fail edilir ve rezervasyon bırakılır.
10. Timeout veya belirsiz sonuçta session `processing` kalır ve reconciliation planlanır.
11. Başarılı initialize sonucunun presentation değeri doğrulanır, sealed saklanır ve browser'a yalnız same-origin destination verilir.

## 8. Callback, reconciliation ve finalization

Mevcut provider-specific callback route ve generic callback runtime kullanılmaya devam eder. İmza, token/binding, amount, currency, store, provider, environment ve credential version kontrolleri adaptör/runtime katmanında kalır.

Payment attempt terminal olduğunda idempotent standard-checkout finalizer çağrılır:

### Captured

- session ve attempt store/provider/reference bağları kilit altında doğrulanır;
- hold hâlâ geçerli ve miktarlar yeterliyse customer/adres resolve veya create edilir;
- tek order, order items ve order event oluşturulur;
- order `source='storefront'`, payment status `completed` olur;
- provider method/reference yalnız güvenli allowlist alanlarla order event'e bağlanır;
- stok düşülür, rezervasyonlar consumed olur;
- cart/intent converted olur;
- receipt ve müşteri hesabı otoritesi etkinleşir;
- transactional order email mevcut outbox tetikleyicisi üzerinden üretilir;
- aynı callback/finalizer tekrarı aynı siparişi döndürür.

### Failed veya cancelled

- order oluşturulmaz;
- rezervasyonlar bırakılır;
- session terminal yapılır;
- müşteri güvenli hata ekranına döner ve sepeti bozulmadan tekrar deneyebilir.

### Provider outcome unknown

- order oluşturulmaz ve başarı ekranı gösterilmez;
- attempt reconciliation kuyruğuna girer;
- hold süresi içinde doğrulanmış sonuç beklenir;
- browser güvenli processing ekranını görür.

### Geç capture / stock conflict

Provider doğrulanmış biçimde parayı çekmiş fakat stok hold'ı güvenle tüketilemiyorsa ödeme `captured`, commerce session `stock_conflict` kalır. Sistem sahte sipariş veya otomatik refund üretmez. Yöneticiye gerçek finansal müdahale olayı gösterilir; provider refund kabiliyeti ayrı bir sonraki özellik olarak ele alınır.

## 9. Browser dönüşü ve müşteri hesabı

Provider customer-return endpoint'i ödeme kanıtı değildir. Dönüş route'u yalnız payment-session cookie ile session'ın server durumunu okur:

- `captured`: receipt/customer credential cookie'lerini etkinleştirir ve `/checkout/success` sayfasına gider;
- `failed/cancelled/expired`: güvenli hata durumuyla checkout'a döner;
- `processing`: bounded polling/retry-after kullanan bekleme ekranına gider;
- invalid/cross-store: varlık sızdırmadan not-found/unavailable döner.

Misafir checkout korunur. Kullanıcı daha önce sihirli link hesabıyla oturum açtıysa mevcut customer ile store-scoped e-posta otoritesi üzerinden eşleştirilir. Oturumsuz kullanıcı için mevcut receipt/customer credential modeli devam eder; raw credential URL'ye veya provider callback'ine konmaz.

## 10. Checkout deneyimi

Checkout çok konuşmayan mevcut Celebix tasarımını korur:

- Etkin hosted provider varsa “Kredi veya banka kartı” tek seçenek olarak görünür.
- Küçük provider logosu ve “Güvenli sağlayıcı ekranında tamamlanır” gibi tek satırlık yardımcı metin yeterlidir.
- Aynı mağazada PayTR ve iyzico birlikte iki kart seçeneği olarak görünmez.
- Provider ek alan gerektiriyorsa yalnız kart seçildiğinde gerekli alan açılır.
- Başlatma sırasında düğme kilitlenir; tekrar tıklama yeni tahsilat üretmez.
- Processing, başarısızlık ve stok değişimi finite ve eyleme dönük Türkçe mesajlarla gösterilir.
- Havale/kapıda ödeme seçildiğinde mevcut doğrudan sipariş tamamlama davranışı değişmez.

## 11. Hata ve kurtarma politikası

- `price_changed`, `stock_unavailable`, `shipping_unavailable`, `payment_unavailable` yeniden quote gerektirir.
- Provider kesin reddi yeni denemeye izin verir; aynı operation ID ile farklı veri kabul edilmez.
- Provider timeout başarısız sayılmaz; reconcile olmadan yeni attempt açılmaz.
- Callback'in iki kez gelmesi bir order ve bir stok tüketimi üretir.
- Callback hiç gelmezse worker provider sorgusuyla reconcile eder.
- Expiry worker yalnız lease sahipliği ve attempt/session version kontrolüyle hold bırakır.
- Worker veya database commit sonucu belirsizse read-only operation recovery kullanılır.
- Provider emergency-disabled olduğunda yeni başlatma durur; mevcut attempt callback/reconcile işlemleri güvenle tamamlanabilir.
- Customer dönüş sayfası payment attempt ayrıntısı, provider raw code veya PII göstermez.

## 12. Güvenlik ve veri minimizasyonu

- Tüm public mutation endpoint'leri exact same-origin ve trusted storefront proxy authority ister.
- Payment session cookie HttpOnly, Secure, SameSite=Lax, host-only, path-scoped ve kısa ömürlüdür.
- CSP genel `https:` veya wildcard provider açmaz.
- Kart/PAN/CVV, provider secret, Authorization, random key, raw callback body, sealed envelope ve kimlik numarası loglanmaz.
- T.C. kimlik numarası sipariş notuna, analytics'e veya public DTO'ya konmaz; provider başlatma için gerekiyorsa mümkün olan en kısa süreli ve dar sealed snapshot'ta tutulur, terminal/expiry sonrasında okunamaz hâle getirilir.
- Database application/host roles doğrudan tablo hakkı almaz; SECURITY DEFINER fonksiyonları exact contract ile çalışır.
- Store-scoped composite foreign key, RLS ve hostname yeniden doğrulaması cross-tenant bağ kurmayı engeller.
- Provider presentation yalnız allowlist edilmiş exact origin ve adapter packet kuralıyla açılır.

## 13. Gözlemlenebilirlik

Yalnız güvenli finite alanlar kaydedilir:

- correlation/operation/session/attempt ID;
- store ID yalnız server logunda;
- provider code ve environment;
- state transition ve safe code;
- süre, reconciliation sayısı ve terminal sınıfı;
- order ID/reference yalnız capture sonrasında.

Ölçümler:

- start → provider-ready süresi;
- provider-ready → captured/failed süresi;
- callback/reconciliation oranı;
- timeout ve late-capture sayısı;
- stok conflict sayısı;
- session expiry ve checkout dönüşüm oranı.

Panelde bu aşamada yalnız gerçek operasyon durumu gösterilir. Ham ödeme payload'ı veya yapay başarı metriği eklenmez.

## 14. Test stratejisi

Uygulama her dilimde red-green-refactor ile ilerler.

### PostgreSQL 16 disposable harness

- migration apply/assert/rollback/reapply;
- iki mağaza arasında cart, method, profile, session, attempt, reservation ve order izolasyonu;
- yalnız bir aktif hosted provider;
- cart version, price, shipping, method ve execution-authority drift;
- aynı varyanta eşzamanlı iki checkout'ta rezervasyon hesabı;
- hosted hold varken cart add, buy-now ve offline complete'in ayrılmış stoğu satamaması;
- begin replay ve fingerprint mismatch;
- provider-ready/captured/failed/unknown/expired geçişleri;
- capture sırasında tek order, tek stok düşümü ve tek receipt;
- tekrar callback/finalizer idempotency;
- expiry ile release, late capture ve stock conflict;
- app/workflow/host role ACL ve forced RLS;
- backup/restore ve migration sonrası sıfır dış bağlantı.

### Unit ve route testleri

- exact request/body/cookie/host/origin kontrolleri;
- hosted method public projection ve private alan sızıntısı taraması;
- provider required-field davranışı;
- presentation seal/open, expiry ve exact URL allowlist;
- start kesin reject, timeout, commit-unknown ve recovery;
- customer return'ın payment proof olmaması;
- offline checkout regresyonu;
- guest/customer receipt erişimi;
- finite error mapping ve PII/secret log taraması.

### Provider contract testleri

- mevcut PayTR ve iyzico golden/signature vektörleri;
- sandbox success, decline, timeout ve callback/retrieve;
- amount/currency/order/token/signature mismatch fail-closed;
- callback replay ve credential-version drift;
- gerçek sandbox kanıtı yoksa live activation'ın kapalı kalması.

### Browser kabulü

- aktif provider yokken yalnız offline yöntemler;
- PayTR etkin mağazada tek kart seçeneği ve güvenli hosted geçiş;
- iyzico etkin mağazada tek kart seçeneği ve gerekli gerçek müşteri alanı;
- çift tıklama/geri tuşu/yenileme ile tek attempt;
- başarılı ödeme → başarı sayfası → hesap siparişleri → admin sipariş detayı;
- başarısız ödeme → sepet korunur → tekrar deneme;
- processing → terminal sonuca güvenli geçiş;
- mobil/masaüstü, klavye, focus, reduced motion ve yatay taşma;
- console/network/runtime loglarında secret, PII, raw token ve tenant authority bulunmaması.

## 15. Teslim sırası

1. Public contract ve checkout UI için failing testler.
2. Additive standard hosted session/reservation/finalization migration'ı ve disposable PostgreSQL kanıtları.
3. `saas-data` repository ve runtime sözleşmeleri.
4. Hosted method quote projection ve start route.
5. Sealed presentation route ve provider başlatma köprüsü.
6. Callback/reconciliation finalizer ve expiry worker.
7. Receipt/customer return bağlantısı.
8. Checkout UI ve offline regresyonu.
9. PayTR + iyzico sandbox acceptance.
10. Customer panel functional maturity doğruluk güncellemesi.
11. Staging deploy, özel domain ve Celebix subdomain smoke testleri.

## 16. Aktivasyon ve geri dönüş

Migration additive uygulanır. Deploy sonrasında hosted-card projection başlangıçta deployment feature gate arkasında kapalıdır.

Aktivasyon sırası:

1. PostgreSQL preflight ve assertions;
2. worker/reconciliation hazır olma kontrolü;
3. PayTR sandbox smoke;
4. iyzico sandbox smoke;
5. Güzide staging mağazasında tek aktif test provider;
6. browser checkout/callback/order/email kanıtı;
7. staging genelinde feature gate açılması.

Feature gate kapatıldığında yeni hosted ödeme başlatılmaz; mevcut attempt callback/reconciliation/finalization işlemleri devam eder. Böylece yarım tahsilat bırakmadan offline checkout korunur.

Canlı provider activation, mağazanın gerçek credential/sözleşmesi, mevcut execution authority ve gerçek sandbox evidence şartları sağlanmadan açılmaz. Bu tasarım veya sentetik test tek başına canlı para tahsilatı yetkisi değildir.

## 17. Bu teslimden sonra kalan öncelikler

Bu çalışma tamamlandığında sıradaki kritik ticaret eksikleri şunlardır:

1. Checkout'ta gerçek kupon/indirim uygulama ve kullanım limiti otoritesi.
2. Provider refund/cancel ve kısmi iade orkestrasyonu.
3. Bölge/desi/sepet kuralına dayalı kargo fiyatlama runtime'ı ve etiket üretimi.
4. Başarılı/başarısız payment notification ayarlarının gerçek gönderim kanallarına bağlanması.

Bu özellikler hosted checkout teslimine karıştırılmaz; her biri ayrı finansal/veri otoritesi ve test planıyla uygulanır.
