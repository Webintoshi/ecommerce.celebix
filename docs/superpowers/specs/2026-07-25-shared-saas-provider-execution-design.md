# Shared-SaaS Provider Execution Authority Design

Status: Kullanıcı tarafından 2026-07-25 tarihinde yazılı olarak onaylandı.

## 1. Amaç ve mevcut durum

Hemenaku merchant-panel geçişinde 86 donor rotanın tamamı kanonik bir hedefe bağlanmıştır. Bunların 77'si gerçek uygulama davranışıyla tamamlanmış, üç eski veya yinelenen donor rota güvenli kanonik hedef lehine reddedilmiş, altı rota ise dış sağlayıcı yürütmesi gerektirdiği için `provider_gated` bırakılmıştır.

Bu tasarım şu altı yüzeyin sahte başarı üretmeden tamamlanmasını tarif eder:

- `/marketplaces`
- `/accounting/invoicing-integration`
- `/marketing/email`
- `/marketing/phone`
- `/marketing/whatsapp`
- `/seo/fast-indexing`

Başlangıç ölçümü:

- rota ve karar kapsamı: 86/86, yüzde 100;
- gerçek çalışan özellik paritesi: 77/86, yüzde 89,5;
- güvenli biçimde kapanmış geçiş: 80/86, yüzde 93;
- dış sağlayıcı yürütmesi bekleyen yüzey: 6/86, yüzde 7.

## 2. Donor incelemesi ve güven sınırı

`apps/storefront-deri-kordon` yalnız read-only donor kaynaktır. Donor kodu shared-SaaS runtime'ına doğrudan bağlanmayacaktır.

İnceleme sonucu:

- Trendyol, Hepsiburada, N11, Amazon TR ve Google Merchant için ağ çağrısı yapan kod bulunmaktadır; ancak kod tek-mağaza ortam değişkenlerine, eski veri modellerine ve legacy runtime varsayımlarına bağlıdır.
- Paraşüt, BizimHesap, Mikro, Logo İşbaşı, KolayBi ve Mükellef muhasebe adaptörleri gerçek sağlayıcı sonucu üretmez; `buildMockAdapter` üzerinden simüle edilmiş başarı döndürür.
- Eski hızlı indeksleme kodu istemci tarafı/localStorage varsayımı taşır ve sağlayıcı başarısını simüle eder.
- Bildirim kodu yalnız sınırlı SMTP/Netgsm yapılandırması içerir; güvenilir teslimat, idempotency, receipt veya durable audit otoritesi değildir.

Sonuç olarak donor kod:

- sağlayıcı adları, alan terminolojisi ve kabiliyet matrisi için referans olabilir;
- credential saklama, tenant seçimi, URL seçimi, retry, başarı sınıflandırması veya durable state için yetki kaynağı olamaz;
- mock/simülasyon davranışları hiçbir koşulda yeni sisteme taşınamaz;
- `apps/admin/**` ve storefront donor dosyaları değiştirilmez.

## 3. Tasarım seçenekleri ve karar

### Seçenek A — Shared-SaaS yürütme otoritesi (seçilen)

Yeni, server-owned credential otoritesi; PostgreSQL job state machine; ayrı workflow role; provider adapter registry ve fail-closed aktivasyon kapısı kurulur. Legacy adaptörler yalnız davranış referansı olarak okunur.

Avantajları tenant/store izolasyonu, güvenli key rotation, idempotency, açık unknown-outcome yönetimi ve gerçek audit kanıtıdır. Daha fazla ilk yatırım gerektirir fakat mevcut SaaS güvenlik modeline uyan tek seçenektir.

### Seçenek B — Legacy adaptörleri doğrudan müşteri paneline bağlamak (reddedilen)

İlk demo daha hızlı görünür. Buna karşılık tek-mağaza varsayımları, browser/ortam authority sızıntısı, mock başarılar ve credential lifecycle eksikliği nedeniyle kabul edilmez.

### Seçenek C — Yüzeyleri sonsuza kadar provider-gated tutmak (reddedilen)

Güvenlidir fakat kullanıcı tarafından istenen eksiksiz işlevsel geçişi sağlamaz.

## 4. Yetki sınırları

### 4.1 Browser

Browser yalnız şunları yapabilir:

- etkinleştirilebilir sağlayıcıları ve maskeli bağlantı durumunu görüntülemek;
- yeni credential setini tek seferlik bir mutasyonla göndermek;
- bağlantıyı devre dışı bırakmak veya rotation başlatmak;
- durable işi hazırlamak, iptal etmek ve güvenli durumunu okumak.

Browser hiçbir zaman şunları alamaz:

- raw credential, token, secret, private key veya şifrelenmiş envelope;
- provider response body;
- internal provider endpoint veya worker lease bilgisi;
- tenant/store seçme yetkisi.

`TenantContext`, aktif store ve izinler mevcut server session'dan çözülmeye devam eder. Header, cookie dışı browser verisi, query veya form alanı store authority olamaz.

### 4.2 Customer-panel server

Customer-panel server:

- mevcut panel session ve `TenantContext` ile mutation yetkisini doğrular;
- request'i exact finite schema ile parse eder;
- credential plaintext'ini loglamadan, kopyalarını sınırlandırarak injected sealer ile envelope'a dönüştürür;
- repository'ye yalnız sealed envelope, public configuration ve canonical fingerprint gönderir;
- provider ağına doğrudan çağrı yapmaz.

### 4.3 PostgreSQL

PostgreSQL durable authority'dir ancak credential plaintext'ini veya decrypt anahtarını bilmez. Tablolar yalnız ciphertext/envelope, key ID, schema version, digest, public provider code, store binding, lifecycle state ve audit projection tutar.

`celebix_saas_app` yalnız panel CRUD/prepare/cancel fonksiyonlarını çalıştırabilir. Provider job claim/heartbeat/finalize/reconcile fonksiyonları yalnız `celebix_saas_workflow` rolüne açılır. Tablolara doğrudan DML tüm uygulama rollerinden kapalı kalır.

### 4.4 Provider worker

Worker:

- yalnız server-owned immutable activation profile ile açılır;
- job claim sırasında store, record, provider profile, plan/feature ve credential version snapshot'ını atomik olarak alır;
- envelope'u AAD doğrulamasıyla açar;
- allowlist'teki exact provider origin'e bounded request gönderir;
- güvenli sınıflandırılmış sonucu durable state'e yazar;
- raw request/response, credential veya müşteri PII'sini loglamaz.

Production aktivasyonu, deploy ve credential girişi bu tasarımın uygulama aşamasında otomatik olarak yetkilendirilmiş sayılmaz.

## 5. Credential otoritesi

Her bağlantı `store_id + provider_code + capability` kapsamında sürümlenir. Aynı store/provider/capability için en fazla bir aktif credential version bulunur.

Persist edilen alanlar:

- profile ID ve store ID;
- finite provider/capability code;
- public, secret içermeyen configuration;
- sealed credential envelope;
- encryption key ID ve envelope schema version;
- credential digest;
- state: `pending_validation`, `active`, `disabled`, `rotation_required`, `revoked`;
- version ve zaman damgaları.

Envelope AAD şu değerleri bağlar:

- profile ID;
- store ID;
- provider code;
- capability;
- credential version;
- envelope schema version;
- key ID.

Rotation yeni bir version oluşturur. Eski version, ona bağlı leased/unknown job kalmadığı kanıtlanmadan silinmez. UI yalnız provider adı, maskeli public account reference, state, version ve son doğrulama zamanını görür.

Credential mutasyonları:

- exact `Origin` ve same-origin CSRF kontrolü;
- valid persistent panel session;
- server-derived active store;
- `integrations.manage` veya ilgili daha dar izin;
- operation ID ve payload fingerprint;
- stale-version ve replay koruması;
- response ve audit üzerinde secret taraması

gerektirir.

## 6. Provider job state machine

Mevcut `awaiting_provider_activation` ve `cancelled` durumları korunur. Yürütme migration'ı additive olarak şu durumları ekler:

- `awaiting_provider_activation`: credential/activation hazır değil;
- `queued`: çalıştırılabilir durable snapshot oluşturuldu;
- `leased`: bir worker tarafından süreli claim edildi;
- `provider_outcome_unknown`: dış side effect oluşmuş olabilir, otomatik tekrar yasaktır;
- `reconciliation_required`: salt-okunur provider reconciliation beklenir;
- `succeeded`: sağlayıcı sonucu kanıtlandı;
- `retryable_failed`: sağlayıcı tarafından side effect oluşmadığı kanıtlanan geçici hata;
- `permanently_failed`: doğrulanmış terminal hata;
- `cancelled`: yürütme başlamadan veya güvenli iptal sınırında iptal edildi.

Temel geçişler:

```text
awaiting_provider_activation -> queued -> leased
leased -> succeeded
leased -> retryable_failed -> queued
leased -> permanently_failed
leased -> provider_outcome_unknown -> reconciliation_required
reconciliation_required -> succeeded | permanently_failed | provider_outcome_unknown
awaiting_provider_activation | queued | retryable_failed -> cancelled
```

`leased`, `provider_outcome_unknown` veya `reconciliation_required` durumundan kullanıcı iptali dış sağlayıcı işlemini geri alınmış sayamaz.

### 6.1 Idempotency

Her execution için Celebix operation ID ve provider idempotency key üretilir. Provider native idempotency destekliyorsa aynı key kullanılır. Desteklemiyorsa timeout/connection reset sonrasında write otomatik tekrarlanmaz; job `provider_outcome_unknown` olur.

### 6.2 Lease ve concurrency

Claim tek SQL çağrısıyla, `FOR UPDATE SKIP LOCKED` veya eşdeğer atomik fonksiyonla yapılır. Lease owner, expiry, attempt number ve credential version snapshot'a bağlanır. Aynı job aynı anda yalnız bir worker tarafından yürütülebilir.

### 6.3 Commit unknown

Provider çağrısından önceki DB commit belirsizliği external call yapılmadan fail-closed kalır. Provider çağrısından sonraki DB finalize commit belirsizliği side effect'i yeniden göndermeye yol açmaz; salt-okunur durable recovery ve provider reconciliation kullanılır.

## 7. Adapter sözleşmesi

Adapter interface'i provider-specific payload'ı dışarı sızdırmayan kapalı bir sözleşmedir:

```ts
interface MerchantProviderAdapter {
  readonly providerCode: MerchantProviderCode;
  readonly capability: MerchantProviderCapability;
  validatePublicConfig(input: unknown): ProviderPublicConfig;
  validateCredential(input: unknown): ProviderCredentialPlaintext;
  execute(input: ProviderExecutionInput): Promise<ProviderExecutionOutcome>;
  reconcile(input: ProviderReconciliationInput): Promise<ProviderReconciliationOutcome>;
}
```

Outcome yalnız sabit sınıflandırma, safe provider reference, bounded timestamp ve retry/reconciliation kararı içerir. Raw response, stack, URL query, request headers ve secrets dönmez.

Adapter kuralları:

- exact HTTPS endpoint allowlist;
- redirect `manual` ve redirect reddi;
- DNS/private-network SSRF koruması;
- bounded timeout, response bytes ve JSON depth;
- fatal UTF-8 ve exact media type;
- log redaction değil, baştan secret-free event üretimi;
- test doubles yalnız testte; production registry'de mock/simulated provider yok;
- disabled provider registry girdisi çalıştırılamaz.

## 8. Sağlayıcı kapsamının parçalanması

Bu çalışma tek commit veya tek migration olarak ele alınmayacaktır. Aşağıdaki bağımsız alt projeler sırasıyla tasarlanıp TDD planı ile uygulanır:

### P0 — Provider execution foundation

- credential envelope authority;
- credential rotation/revocation;
- job queue/lease/finalize/recovery state machine;
- workflow repository ve injected worker;
- maskeli panel bağlantı UI'si;
- network çağrısı olmayan fake-adapter test harness'ı;
- default disabled activation.

### P1 — IndexNow adapter

- yalnız verified active storefront host için IndexNow;
- server-owned host key;
- key-file ownership ve exact URL validation;
- timeout/unknown/reconciliation davranışı.

Eski istemci/localStorage indeksleme kodu kullanılmaz.

### P2 — Mesaj kanalları

- e-posta, SMS/telefon ve WhatsApp ayrı capability ve consent/audience kontrolleri;
- teslimat receipt ve provider reference;
- unsubscribe/opt-out ve suppression authority;
- her kanal için ayrı provider seçimi ve ayrı credential profile.

Provider isimleri ilgili alt proje tasarımında resmi dokümantasyon ve sandbox erişimine göre sabitlenir. Donor SMTP/Netgsm ayarı otomatik seçim sayılmaz.

### P3 — Pazar yerleri

- Trendyol, Hepsiburada, N11, Amazon TR ve Google Merchant ayrı adapter;
- listing/inventory/order capability'leri ayrı izin ve job türleri;
- external ID mapping, cursor/checkpoint ve webhook doğrulama;
- provider-specific rate limit ve reconciliation.

Legacy adapter kodu doğrudan import edilmez.

### P4 — Muhasebe

- gerçek provider API contract'ı olmayan donor mock'ları tamamen reddedilir;
- resmi sandbox ve sözleşmesi doğrulanan sağlayıcılar ayrı adapter olur;
- invoice/customer/payment side effect'leri ayrı idempotency ve reconciliation sınırlarına sahip olur;
- mali veri ve PII audit/log içine girmez.

### P5 — Staging ve production gate

- her adapter için resmi sandbox kanıtı;
- disposable staging credential rotation/revocation;
- wrong-store, wrong-role, replay, concurrent claim, timeout ve secret-scan kanıtı;
- production aktivasyonu için ayrı yazılı onay.

## 9. Kullanıcı deneyimi

Altı mevcut sayfa korunur. Provider-gated açıklaması gerçek durumla değiştirilir:

- credential yok: `Sağlayıcı bağlantısı gerekli`;
- credential pending: `Bağlantı doğrulanıyor`;
- active ve job queued: `İş sırada`;
- leased: `Sağlayıcıya iletiliyor`;
- outcome unknown: `Sonuç doğrulanıyor — tekrar göndermeyin`;
- succeeded: kanıtlanmış safe reference ve zaman;
- failed: sabit güvenli hata ve izin verilen sonraki eylem.

UI hiçbir durumda `gönderildi`, `senkronize edildi`, `fatura oluşturuldu` veya `indekslendi` ifadesini durable/provider kanıtı olmadan göstermez.

## 10. Test ve kabul kriterleri

Her alt proje şu kanıtları taşır:

- contract parser exact-key, bounds ve immutability testleri;
- repository transaction, replay, mismatch ve commit-unknown testleri;
- PostgreSQL 16 concurrency, RLS, direct-DML denial, backup/restore, rollback/reapply ve cleanup harness'ı;
- credential envelope AAD tamper, unknown key, rotation ve secret-at-rest taraması;
- worker double-claim, lease expiry, stale worker finalize ve cancellation race testleri;
- provider timeout-before-write, timeout-after-write ve malformed response sınıflandırması;
- SSRF, redirect, DNS rebinding, oversized body, content-type ve UTF-8 negatifleri;
- customer-panel missing/wrong Origin, session, role, feature, store ve operation ID negatifleri;
- browser loaded/empty/error/unknown/permission responsive durumları;
- Owner ve customer-panel test/typecheck/build regresyonu;
- `apps/admin/**` diff 0;
- production connection/deploy/credential mutation 0, ayrıca yetkilendirilmedikçe.

Bir sağlayıcının adapter testi mock ile yeşil olması o sağlayıcıyı `complete` yapmaz. Manifest yalnız disposable resmi sandbox veya yetkilendirilmiş staging kanıtından sonra `provider_gated -> complete` geçer.

## 11. Başarı tanımı

Kod seviyesinde foundation ve adapter'ların tamamlanması ile altı rota gerçek provider execution state'ini yönetebilir hâle gelir. Eksiksiz yüzde 100 geçiş ancak:

1. her altı yüzey için en az bir gerçek, resmi destekli adapter;
2. safe credential lifecycle;
3. sandbox/staging external side-effect ve reconciliation kanıtı;
4. secret/log/runtime taraması;
5. rollback ve credential revocation;

tamamlandığında raporlanabilir.

Production deploy, production credential, merge veya provider activation bu tasarım onayıyla otomatik olarak yetkilendirilmiş değildir.
