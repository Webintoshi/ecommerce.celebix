# Brevo and Klaviyo Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bütün Celebix mağazalarının kendi Brevo veya Klaviyo hesabına izinli e-posta kişilerini güvenle aktarabildiği, resmi logolu ve sade bir ortak bağlantı ekranını yayımlamak.

**Architecture:** E-posta bağlantıları ayrı sözleşme/veri modülünde, mevcut mağaza oturumu ve PostgreSQL yetkisiyle çalışır. Kaynak izin değişiklikleriyle aynı transaction içinde kalıcı outbox yazılır; owner'ın ayrı, sınırlı worker modülü sağlayıcıya eşitler ve retleri uzlaştırır. Panel kayıtlı durum okur; kampanya düzenleme ve gönderme dış serviste yapılır.

**Tech Stack:** Mevcut Next.js 16.2.1, React 19.2.3, TypeScript, PostgreSQL 16, `pg`, native `fetch`, Node `crypto`; yeni sağlayıcı SDK'sı veya kampanya editörü bağımlılığı yok.

**Spec:** `docs/superpowers/specs/2026-10-09-email-provider-connections-design.md`

Durum: Kullanıcı planı ve aynı sohbet içinde kodlamayı onayladı. Görev 1–7 uygulandı; Görev 8 izole kabul/yayın hazırlığında. Sağlayıcı kayıt/izinleri, gerçek hesap kabulü ve canlı yayın bekliyor. Üretim verisi, sağlayıcı anahtarı veya dışa aktarım değiştirilmedi. Ayrıntılar: docs/qa/evidence/email-marketing-connections/acceptance.md.

## Global Constraints

- `/marketing/email` korunur; ilk sağlayıcılar yalnız `brevo | klaviyo`; her mağazada bir etkin dışa aktarım bağlantısı.
- İlk bağlantı; izinli e-posta, varsa ad/soyad, izin zamanı/kaynağı ve mağazaya ayrılmış liste/grup üyeliğini eşitler.
- Uygula gerçek bağlantı ve kuyruk kaydı oluşturur; ayrı taslak/yayımla/etkinleştir adımı yoktur. Açılış yalnız okur.
- Anahtarlar AES-256-GCM; mağaza, bağlantı, sağlayıcı, kullanım amacı ve anahtar sürümü authenticated data içine bağlanır.
- Exact-host oturum, Origin, `integrations.read/manage`, support süresi ve audit yetkileri korunur. Ham anahtar hiçbir yanıt/log/URL/işlem tekrar kaydına yazılmaz.
- Worker toplam eşzamanlılık 2, ayrılmış DB pool üst sınırı 4, tek sağlayıcı çağrısı 5 saniye, iş talebi en çok 25 kayıt.
- Delta kontrol 5 dakika; tam kontrol hedefi 24 saat; delta örtüşmesi 10 dakika; sayfa en çok 100 profil, bağlantı başına polling turunda en çok 2 istek. Bunlar SLA değildir.
- Klaviyo kişi başına 30 dakikada en fazla bir Subscribe işi. `202 Accepted` eşitlenmiş kişi veya tamamlanmış ret sayılmaz.
- Mevcut sağlayıcı profilini otomatik yeniden abone yapma; spam/bounce engellerini kaldırma. Tarihi/hedef adresi belirsiz izni uydurma.
- Brevo ilk aktarımında iki yıldan eski izin hariç tutulur. Ücretsiz paket bilgisi tarihli katalog bilgisidir; gerçek hesap kotası doğrulanamadığında bilinmiyor gösterilir.
- Anahtar sürümü ve connection generation ayrıdır. Gönderilmiş işleri generation ile iptal edilmiş sayma; disconnect/switch sonucu uzlaştırıp eski Celebix üyeliğini temizler.
- Geri almada ret kabulü/kuyruğu ve gerekli minimum worker devam eder. Dış kampanyalar etkin kalırken ret yolu sessizce kapatılmaz.
- Aynı yükte entegrasyon kapalı/açık p95 admin yanıt süresi karşılaştırılır; %10'dan büyük ve tekrarlanabilir artış kabulü durdurur.
- Resmi, orantılı Brevo/Klaviyo logoları; statik varlık, harici hotlink veya üçüncü taraf logo paketi yok. Mevcut tasarım dili ve 1440/1024/390 piksel kabulü.
- NET → SITE ortak panel yayını; uygulamadan önce güncel kaynak, SQL numarası ve tek yayın sahibi yeniden doğrulanır. Eski 8ec kaynak veya bu belge canlı durum kanıtı değildir.

## Review Focus

1. Müşteri e-postası değişirken eski işaretli izin ve tarihi korunmuş görünür: yeni adrese izin taşınmaz, eski adres üyeliği temizlenir (Task 3).
2. Anahtar/liste doğrulaması ile Uygula arasında destek süresi dolar veya kişi başka mağazaya geçer: aday reddedilir, kayıt/aktarım oluşmaz (Task 6).
3. Sağlayıcı `202` kabul ederken yerel ret veya disconnect gelir: işlem korunur, sonuç okunur ve gerekli ret uygulanır; ikinci Subscribe gönderilmez (Task 5).
4. Geç gelen ret olayı veya tamamlanmamış polling sayfası: cursor ileri atlamaz; eski olumlu durum reddi geri açmaz (Task 5).
5. Dış servis çalışmazken panel açılır, hata döner veya logo dosyası bozuk olur: temel admin kullanılabilir, seçimler korunur; bozuk SVG çalıştırılmaz (Tasks 4, 7, 8).

---

## File map and dependency order

- `packages/saas-contracts/src/email-marketing-connections/`: istemciye güvenli tipler ve katı ayrıştırıcılar; root `src/index.ts` export.
- `packages/saas-data/src/email-marketing-connections/`: `types.ts`, `errors.ts`, `credential-crypto.ts`, `repository.ts`, `consent.ts`, `workflow-repository.ts`, `sync.ts`, `provider.ts`, `transport.ts`, `providers/brevo.ts`, `providers/klaviyo.ts`, `index.ts`; her birinin komşu `.test.ts` dosyası.
- `apps/owner/scripts/sql/saas/email-marketing-connections.{up,down}.sql`, `email-marketing-connections_assertions.sql`, `email-marketing-connections-migration.test.ts`: numara ayırmadan aday SQL; yayın kilidinde güncel migration numarasıyla adlandırılır ve manifest'e kaydedilir.
- `apps/customer-panel/lib/email-marketing-http/`, `lib/email-marketing-ui/`, `lib/server-email-marketing/`: ayrı HTTP, client/state ve sunucu kayıt sınırları; Google/ödeme handler'ı büyütülmez.
- `apps/customer-panel/components/email-marketing/`: bağlantı kartı/penceresi ve marka bileşeni; `public/brands/brevo.svg`, `klaviyo.svg` küçük statik varlıklar.
- `apps/owner/lib/email-marketing/`: `config.ts`, `worker.ts`, `production.ts`, `default.ts`; `instrumentation.ts` ayrı singleton başlangıcı.
- Kaynak SQL çağrı sarmalayıcıları ve müşteri izin girdisi Task 3'te; ana müşteri/sipariş işlevlerinin destek guard'ları sökülmez.
- Görev sırası 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Task 4 adaptörleri aynı sözleşmeye göre ayrı uygulanabilir; ortak arayüzü tek sorumlu bütünleştirir.

## Task 1: Public contracts and secret binding

**Files:** Create contracts `index.ts`, `validation.ts`, `connections.test.ts`; data `types.ts`, `errors.ts`, `credential-crypto.ts`, `credential-crypto.test.ts`, `index.ts`. Modify iki package root `src/index.ts`.

**Interfaces:**
- `EmailMarketingProvider = 'brevo' | 'klaviyo'`; `parseEmailMarketingProvider(value: unknown): EmailMarketingProvider`.
- `EmailMarketingConnection`: `id`, `provider`, `version`, `generation`, `credentialVersion`, `accountId`, `accountName`, `listId`, `listName`, `status: disconnected|connected|draining|needs_reconnect|error`, `senderStatus: verified|pending|unknown`, `lastCheckedAt`, `lastSyncedAt`, `errorCode`; nullable bilgiyi boş/sıfır yapma.
- `EmailMarketingAudiencePreview`: `eligible`, `denied`, `missingEvidence`, `needsRenewal`, `providerBlocked: number|null`, `unchecked`, `overLimit: number|null`, `providerCheckedAt: string|null`.
- `EmailMarketingSyncSummary`: `queued`, `verified`, `blocked`, `failed`, `pendingVerification`, `asOf`, `suppressionCheckedAt`; `EmailMarketingOverview`: `connections`, `sync`, `configured`.
- `EmailMarketingSelection = {kind:'existing';listId:string} | {kind:'create';name:string}`; `parseEmailMarketingApplyIntent(value:unknown): {candidateId:string;expectedVersion:number;selection:EmailMarketingSelection}`.
- `EmailMarketingList = {id:string;name:string}`; `EmailMarketingAccount = {id:string;name:string;senderStatus:'verified'|'pending'|'unknown'}`. Public nullable connection alanları açıkça `string|null` olarak tanımlanır; private key veya ham sağlayıcı yanıtı eklenmez.
- Data-only `EmailMarketingCredentialBinding = {storeId;credentialOwnerId;provider;purpose:'candidate'|'connection'|'webhook';credentialVersion}`. `sealEmailMarketingCredential(apiKey:string,binding:EmailMarketingCredentialBinding,keyring:MerchantProviderCredentialKeyring): SealedEmailMarketingCredential`; `openEmailMarketingCredential(envelope,binding,keyring): string`. Ring tipini mevcut provider-execution modülünden kullan; kendi AAD'sini üret.

- [x] **Step 1 — RED:** Katı schema ve kripto testlerini yaz: bilinmeyen provider/alan, negatif version, sahte storeId, getter, kontrol karakteri reddedilir; `providerBlocked:null` korunur. Envelope wrong store, owner, purpose, provider, credentialVersion ve keyId ile açılamaz; hata mesajında örnek anahtar bulunmaz.
  Test `rejects_unknown_provider_and_cross_store_secret`: `assert.throws(() => parseEmailMarketingProvider('sender')); assert.throws(() => openEmailMarketingCredential(envelope,otherStoreBinding,keyring));` — envelope ve bindings testte aynı anahtarla iki farklı store UUID için hazırlanır.
- [x] **Step 2 — Run RED:** Contracts klasöründe `node --experimental-strip-types --test src/email-marketing-connections/*.test.ts`; data klasöründe `node --experimental-transform-types --test src/email-marketing-connections/credential-crypto.test.ts`. Beklenen: yeni export/işlev eksikliği nedeniyle FAIL.
- [x] **Step 3 — Implement:** Yukarıdaki tip/parsers/seal-open işlevlerini küçük dosyalarda ekle. 32-byte ring, 12-byte nonce, 16-byte tag ve canonical AAD; private envelope public contract içine girmez.
- [x] **Step 4 — GREEN:** İki targeted komut ve iki package typecheck PASS; mevcut public parser fixture'ları korunur.
- [x] **Step 5 — Commit:** Yalnız bu dosyaları stage et: `feat: add email connection contracts and credential binding`.

## Task 2: Durable connection commands and isolation

**Files:** Create aday SQL üçlüsü/test, data `repository.ts`, `repository.test.ts`; extend Task 1 data types.

**Interfaces:** `EmailMarketingAuthorityInput = {tenantContext:TenantContext;now:Date}`. `EmailMarketingCandidate = {candidateId;provider;accountId;accountName;expiresAt}`.
`EmailMarketingConnectionRepository` produces:
- `overview(a:EmailMarketingAuthorityInput): Promise<EmailMarketingOverview>`.
- `validate(a & {provider;apiKey;sessionBinding;operationId}): Promise<EmailMarketingCandidate>`.
- `lists(a & {candidateId;sessionBinding;cursor?:string}): Promise<{items:readonly EmailMarketingList[];nextCursor?:string}>`.
- `preview(a & {candidateId;sessionBinding;listId?:string}): Promise<EmailMarketingAudiencePreview>`.
- `apply(a & {candidateId;sessionBinding;expectedVersion;operationId;selection}): Promise<EmailMarketingConnection>`.
- `rotate(a & {candidateId;sessionBinding;expectedVersion;operationId}): Promise<EmailMarketingConnection>`.
- `recheck(a & {expectedVersion;operationId}): Promise<EmailMarketingConnection>`; `disconnect(a & {expectedVersion;operationId}): Promise<EmailMarketingConnection>`.
`createPostgresEmailMarketingConnectionRepository(options:{pool;role:'celebix_saas_app';timeouts;keyring;providers;uuid}): EmailMarketingConnectionRepository`. `providers` is Task 4 registry; tests inject doubles before adapters exist.

- [x] **Step 1 — RED:** SQL behavior assertions: roles cannot directly read/write tables or leak encrypted credentials; wrong store/support expiry fail. Uygula replay preserves one connection/job/audit; mismatch/version conflict fail. Account ID cannot bind to two stores, including an old draining connection. GET overview produces no INSERT/UPDATE. Different-account rotation fails. Validation candidate belongs to store/principal/session, expires in 15 minutes, and cannot activate twice.
  Test `apply_replays_without_second_provider_call`: tekrar sonucunda `assert.equal(connectionCount,1); assert.equal(bootstrapJobCount,1); assert.equal(providerWriteCount,1);` Native assertion `CROSS_STORE_ACCOUNT_BINDING` ikinci mağazanın aynı canonical hesabı bağlayamadığını doğrular.
- [x] **Step 2 — Run RED:** Run `email-marketing-connections-migration.test.ts` with owner Node test pattern; run assertions in an isolated PostgreSQL16 database after existing migration chain. FAIL must name missing email tables/functions, not unavailable PostgreSQL. If no DB exists, start a disposable local cluster under task temporary directory; never use production to seed test data.
- [x] **Step 3 — Implement:** Add RLS/FORCE RLS tables `email_marketing_connections`, `email_marketing_candidates`, `email_marketing_operations`, `email_marketing_contacts`, `email_marketing_sync_jobs`, `email_marketing_inbound_events`, `email_marketing_consent_events`, and indexed audience projection. Unique provider/account while nonclosed, one live connection/store, composite store foreign keys. Admin SECURITY DEFINER commands use native merchant authority + `platform_support_begin` and transactional support journal. Final write support expiry uses current DB time, not a pre-transport authorization snapshot. Store only sealed credentials; audit/replay payload contains safe fields; keyed fingerprint protects same-operation/different-key intent without persisting raw key. Candidate is internal temporary validation state, never a customer-facing draft. Claim/checkpoint/finalize release transaction before provider IO; cancelled/expired candidates destroy their envelope.
- [x] **Step 4 — GREEN:** Native assertions PASS; rerun up/no-op replay, empty DB down/reapply, rollback refusal with retained consent/jobs. TS repository recovery tests show replay occurs before transport. Assert all unrelated function definitions, table rows and ACLs unchanged. No historical grant backfill from customer phone/email alone.
- [x] **Step 5 — Commit:** `feat: persist tenant-bound email marketing connections`.

## Task 3: Target-address consent and atomic outbox

**Files:** Extend Task 2 SQL/assertions; create data `consent.ts`, `consent.test.ts`. Modify `src/customers/{types,validation,canonical,repository}.ts`, `src/storefront/newsletter-repository.ts`, `src/store-engagement/repository.ts`; their existing tests. Modify panel `lib/customer-http/request-input.ts`, its tests, `components/customers/CustomerFormConsole.tsx`, `CustomerEditConsole.tsx`, `lib/customer-ui/route-behavior.test.ts`.

**Interfaces:**
- `resolveEmailMarketingConsent(events:readonly EmailMarketingConsentEvent[],now:Date,provider:EmailMarketingProvider): EmailMarketingConsentDecision` returns `eligible|denied|missing_evidence|needs_renewal|archived` with target address, ledger version, evidence timestamp/source.
- `EmailMarketingConsentEvent={storeId;email;sequence:number;kind:'grant'|'deny'|'archive'|'address_changed';source:'newsletter'|'customer'|'cart_capture'|'provider';sourceId;sourceVersion;recordedAt;consentedAt:string|null;evidenceVersion:string|null}`. `EmailMarketingConsentDecision={kind;email;consentVersion:number;consentedAt:string|null;source:EmailMarketingConsentEvent['source']|null}`. `kind` yukarıdaki beş karar değeridir; sıralama kalıcı sequence + gerçek olay zamanı kullanır.
- `CustomerConsentInput` gains optional `targetEmail` only for `channel:'email',status:'granted'`; it must equal the save request's normalized email. Public CustomerConsent response shape remains unchanged.
- New SQL wrappers `saas.email_marketing_customers_save` and `_customers_archive` keep existing native signatures; `_newsletter_subscribe(text,timestamptz,text,text)` and `_contact_capture(text,text,timestamptz,uuid,uuid,text,text,boolean,text)` keep caller signatures. Call existing native functions, preserve authority/support/replay outcomes, and append source event/outbox in the same transaction. Repository callers use these wrappers; original functions and their guarded definitions remain intact.
- `saas.email_marketing_audience_page(store,connection,cursor,limit)` is indexed keyset read, max100; it includes proof-bearing newsletter and capture rows plus new target-address customer evidence. Missing-proof legacy customer rows are counted/excluded.

- [x] **Step 1 — RED:** Tests assert same-email generic edit preserves original evidence/date and no new grant; email edit clears form's email checkbox until explicitly selected and cleans old membership. New `targetEmail` mismatch fails; old client carrying granted checkbox to new address produces no transferable grant. `marketingConsent:false` is neither grant nor denial. Replay emits one event; ret beats older grant; restock/review consent never enters audience. 205 eligible contacts enumerate as100/100/5, not old newsletter limit200. Brevo evidence older2years gives `needs_renewal` without updating timestamp.
  Test `old_granted_checkbox_is_not_permission_for_new_email`: `assert.equal(newAddressDecision.kind,'missing_evidence'); assert.equal(oldAddressCleanupJobs,1); assert.equal(newSubscribeJobs,0);` Kaynak satır ve audit/event sayıları SQL transaction testinde kontrol edilir.
- [x] **Step 2 — Run RED:** Run targeted data consent/source tests and panel customer parser/route behavior tests; native SQL source assertions must FAIL before wrappers exist.
- [x] **Step 3 — Implement:** Preserve prior email grant timestamp on unchanged address/status; treat explicit target-attested grant separately from ordinary save. New UI resets email permission when address changes; no automatic checkbox recheck. Save wrappers use source operation/row version to dedupe, emit ret/cleanup against old address, and queue within the native transaction. Initial snapshot uses cursors/source watermarks; new mutations cannot be lost between snapshot and incremental processing. Provider ret writes source-address denial through a narrow workflow function, without creating customers or changing phone/SMS permission.
- [x] **Step 4 — GREEN:** Repeat native rollback/commit-fault tests: no source commit without event/outbox; failed save/replay cannot invent grant. Old customer read payloads, existing customer/order linkage, newsletter subscribe response and popup coupon capture behavior still pass. No new external request during source saves.
- [x] **Step 5 — Commit:** `feat: bind email marketing consent to target addresses`.

## Task 4: Bounded Brevo and Klaviyo adapters

**Files:** Create data `provider.ts`, `transport.ts`, `providers/{brevo,klaviyo}.ts` and adjacent tests; create `providers/registry.ts`.

**Interfaces:** `EmailMarketingProviderAdapter` produces:
- `EmailMarketingListPage={items:readonly EmailMarketingList[];nextCursor?:string}`; `EmailMarketingContactState={kind:'absent'|'known'|'unknown';profileId:string|null;marketingStatus:'subscribed'|'unsubscribed'|'suppressed'|'unknown';listIds:readonly string[];suppressionReasons:readonly string[];consentUpdatedAt:string|null;observedAt:string}`. `EmailMarketingSuppressionPage={items:readonly EmailMarketingProviderEvent[];nextCursor?:string;completedThrough:string|null}`; event tipi yalnız eşlenmiş profileId/email, ret türü, gerçek sağlayıcı zamanı ve olay kimliği taşır.
- `account(apiKey:string):Promise<EmailMarketingAccount>` with canonical id and `senderStatus`.
- `lists(apiKey,cursor?):Promise<EmailMarketingListPage>`; `createList(apiKey,name):Promise<EmailMarketingProviderResult<EmailMarketingList>>`.
- `contact(apiKey,email):Promise<EmailMarketingContactState>` returns `absent|known|unknown`, profileId, marketing status/suppression, list membership and provider timestamps.
- `updateProfile(apiKey,profileId,profile):Promise<EmailMarketingProviderResult<EmailMarketingContactState>>`; `addMembership(apiKey,profileId,listId)` and `removeMembership(apiKey,profileId,listId)` return `EmailMarketingProviderResult<null>`.
- `subscribeNew(apiKey,profile,evidence,listId,historical):Promise<EmailMarketingProviderResult<null>>`; `unsubscribe(apiKey,profileId,scope:{kind:'store'}|{kind:'list';listId:string})` same result.
- `suppressionPage(apiKey,cursor,watermark):Promise<EmailMarketingSuppressionPage>`; `capabilities` states whether delta/webhook/sender checking is verified. `EmailMarketingProviderResult<T>` is `{kind:'verified';value:T}` or `{kind:'accepted'|'unknown';providerReference?:string}`.
- `createEmailMarketingProviders({fetch,now}):Readonly<Record<EmailMarketingProvider,EmailMarketingProviderAdapter>>`.

- [x] **Step 1 — RED:** Fixtures assert Brevo organization_id, Klaviyo account source id, exact API hosts/headers, scope failures, 401/403/429 with Retry-After, redirects refused, >1MiB or malformed responses rejected and timeout5000ms. Existing suppressed Klaviyo profile yields no Subscribe; import never passes blacklist=false for existing Brevo contact. List-only cleanup cannot globally unsubscribe an absent member; unknown profile is not created by unsubscribe. `202` returns accepted, never verified. No arbitrary endpoint/raw error body/campaign send.
  Test `klaviyo_202_is_only_acceptance`: fixtures' subscribe yanıtı202 iken `assert.equal(result.kind,'accepted'); assert.equal('value' in result,false);` Test `suppressed_profile_uses_no_subscribe`: `assert.equal(subscribeRequests,0);`.
- [x] **Step 2 — Run RED:** `node --experimental-transform-types --test src/email-marketing-connections/providers/*.test.ts src/email-marketing-connections/transport.test.ts` from data package. Missing implementations FAIL; no real credentials needed.
- [x] **Step 3 — Implement:** Native fetch only, fixed `https://api.brevo.com/v3/` / `https://a.klaviyo.com/api/`, Klaviyo revision2026-07-15 confirmed against official reference at execution. Sender readiness is unknown if not safely retrievable. Existing profiles receive status-preserving fields/membership operations; new profiles only use evidence-bound subscribe. Historical flag promises only documented DOI/list-flow behavior. Creation timeout is unknown, recovered by bounded identity/list read, not blind repeated create. Ambiguous matching lists require attention. Marketing-only unsubscribe; no phone/SMS/transactional modifications. Expose documented Brevo webhook setup/removal to the worker as capability-specific methods, preserving other hooks.
- [x] **Step 4 — GREEN:** Fixtures and data typecheck PASS. Document exact Brevo general/other endpoint budgets and Klaviyo per-endpoint/private-key sharing. No guessed quota or public Brevo OAuth capability. Verify adapter contains no campaign send, checkout, billing or arbitrary code methods.
- [x] **Step 5 — Commit:** `feat: add bounded Brevo and Klaviyo contact adapters`.

## Task 5: Reconciliation, revoke priority and shared worker

**Files:** Create data `workflow-repository.ts`, `sync.ts`, tests; extend native SQL. Create owner `lib/email-marketing/{config,worker,production,default}.ts` and tests; modify `instrumentation.ts`. Create hook handler in panel `lib/email-marketing-http/webhook.ts` and test; route `/api/marketing/email-connections/webhooks/brevo/[connectionId]/route.ts`.

**Interfaces:**
- `EmailMarketingWorkflowRepository`: `claim({workerId,now,leaseUntil,limit:25,token}):Promise<readonly EmailMarketingSyncJob[]>`; `checkpoint({jobId,leaseToken,now,result}):Promise<boolean>`; `finish({jobId,leaseToken,now,outcome}):Promise<boolean>`; `recordProviderEvent({connectionId,eventId,eventTime,receivedAt,event}):Promise<'recorded'|'replayed'|'rejected'>`; `reconcileDue({now,limit}):Promise<number>`.
- `runEmailMarketingSyncJob(job:EmailMarketingSyncJob,deps:{repository;providers;keyring;now}):Promise<void>`; `createEmailMarketingWorker(options):{runOnce():Promise<EmailMarketingTickSummary>}`.
- `EmailMarketingSyncJob={id;storeId;connectionId;generation;credentialVersion;email:string|null;consentVersion:number|null;kind:'bootstrap'|'profile'|'subscribe'|'unsubscribe'|'remove_membership'|'reconcile'|'cleanup';leaseToken;leaseUntil;phase:'queued'|'dispatched'|'accepted'|'unknown';providerReference:string|null}`; snapshot private hedef/evidence/envelope yalnız workflow rolüne Task1 bindings ile döner. `EmailMarketingTickSummary={claimed:number;verified:number;blocked:number;pending:number;failed:number}`.
- `resolveEmailMarketingWorkerMode(env):'off'|'revoke_only'|'full'` from `CELEBIX_EMAIL_MARKETING_WORKER_MODE`; missing=off. `initializeEmailMarketingProductionRuntime(config,deps):Promise<{runOnce;close}>`; `startDefaultEmailMarketingProductionWorker():Promise<{stop}>`.
- `parseEmailMarketingWorkerConfig(env):EmailMarketingWorkerConfig` produces `{database:{url;name};workerId;mode;keyring}`. DB uses existing `CELEBIX_SAAS_DATABASE_URL`; worker ID `CELEBIX_EMAIL_MARKETING_WORKER_ID`; ring uses existing `CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_ACTIVE_KEY_ID` / `CELEBIX_MERCHANT_PROVIDER_CREDENTIAL_KEYS` parser. Provider API keys yalnız mağaza credential kayıtlarından okunur; env'de ortak merchant API anahtarı yoktur.

- [x] **Step 1 — RED:** Worker fixtures/native assertions cover crash after provider accept,202+ret, disconnect mid-flight, key rotation, lease expiry and another worker reclaim. Assert one subscribe/profile/30min; credentialVersion change never triggers bootstrap again. Delayed old grant cannot overtake ret; incomplete polling page cannot advance watermark. Existing copied subscriptions do not reappear after rollback. Claim25/concurrency2/pool4/timeout5000 and fair store allocation are checked. Two owner instances cannot multiply active-job limit. Wrong webhook secret, oversized body, duplicate event and forged store fail.
  Test `ret_after_accepted_subscribe_survives_rotation`: `assert.equal(subscribeRequests,1); assert.equal(unsubscribeJobs,1); assert.equal(connection.status,'draining'); assert.equal(secretDestroyed,false);` — provider completion remains unknown in this fixture. Test `unfinished_poll_keeps_watermark`: `assert.equal(savedWatermark,previousCompletedWatermark);`.
- [x] **Step 2 — Run RED:** Run data sync/workflow tests and owner new module tests with `--conditions=react-server --experimental-transform-types --test`; run native workflow assertions. Missing worker functions and ordering protections FAIL.
- [x] **Step 3 — Implement:** Durable claim → mark dispatched → call → checkpoint → readback → finish. Grant/import closed during draining; old envelope accessible only for cleanup/revoke/reconciliation, destroyed on verified close. Unknown/accepted result schedules readback without a repeat Subscribe; if evidence remains uncertain, attention state. A missing/changed permission after dispatch schedules correction. Delta5min/overlap10min plus cursor sweep24h within per-account budgets; last completed check only after full tour. Brevo bearer/custom-secret+TLS, event-size cap64KiB, mapping/dedup and conservative timestamp policy; no invented HMAC. Klaviyo ordinary keys use polling, not assumed paid system hooks.
  Dispatch öncesi durumun değişmeden okunması işi tamamlamaz. Gerekli sağlayıcı işlem/timestamp kanıtı bulunamıyorsa bekleyen asenkron grant sonlandı varsayılmaz; yeni grant ve tam disconnect kapanışı attention durumunda tutulur. Böyle bir durumda dokümansız bir30dakika timeout'unu başarı olarak kullanma.
- [x] **Step 4 — GREEN:** Register independent worker in owner instrumentation using existing order-email scheduling style, one nonoverlapping timer after settled tick; boot failure reports degraded email feature and does not prevent web/onboarding/payment workers. Dedicated pool4, PostgreSQL16/workflow-role/function preflight, SQL leases fence deployments, safe counter-only logs. `revoke_only` drains ret/cleanup/readback and forbids grant/import; `off` only allowed operationally when no managed audience/pending jobs remain. Existing owner instrumentation/worker tests PASS.
- [x] **Step 5 — Commit:** `feat: reconcile email subscriptions with a bounded shared worker`.

## Task 6: Tenant-safe HTTP and runtime wiring

**Files:** Create panel `lib/email-marketing-http/{handler,request-input}.ts`, tests; `lib/server-email-marketing/{runtime,config}.ts`, tests; API overview `app/api/marketing/email-connections/route.ts`, children `validate`, `lists`, `preview`, `apply`, `rotate`, `recheck`, `disconnect` route.ts. Modify `lib/server-panel-access/postgres-runtime.ts`.

**Interfaces:** `ApprovedServerPanelAccessRuntime = ServerPanelAccessRuntime & {readiness:{mode:'approved_staging'};panelOrigin:string}`; `ServerEmailMarketingRuntime={access:ApprovedServerPanelAccessRuntime;email:EmailMarketingConnectionRepository}`; `registerServerEmailMarketingRepository(access,repo):void`; `resolveServerEmailMarketingRuntime(access):ServerEmailMarketingRuntime|null`.
`createEmailMarketingHttpHandlers({resolveRuntime,now,requestId})` returns `get(request,area:'overview'|'lists'|'preview')` and `post(request,area:'validate'|'apply'|'rotate'|'recheck'|'disconnect')`. Candidate session binding is HMAC/hash of opaque session credential on server; not sent by client.

- [x] **Step 1 — RED:** HTTP fixtures test wrong host/store, expired support between validate/apply, missing cookie, forbidden integrations.manage, wrong Origin, unexpected x-store-id/query fields, body>16KiB, wrong candidate/session, operation UUID, stale version and safe provider errors. Response/log HTML/replay never includes test API key. GET lists uses already sealed candidate, no API key query. Authenticated overview causes zero provider calls.
  Test `support_expired_after_validation_cannot_apply`: `assert.equal(response.status,403); assert.equal(activationCalls,0);` — now() validate sonrası30dakikalık destek sonunu geçer. Test `overview_reads_no_provider`: `assert.equal(providerCalls,0);`.
- [x] **Step 2 — Run RED:** From panel `node --experimental-transform-types --test lib/email-marketing-http/*.test.ts lib/server-email-marketing/*.test.ts`; missing handlers/runtime FAIL.
- [x] **Step 3 — Implement:** Reuse exported cookie/origin/session/action helpers; do not import Google's private authorize/body functions. Strict schemas/no-store/redaction, 16KiB streamed body cap, stable operation keys and safe statuses. Resolve actual tenant context per request and recheck native authority before final write. Register repository only when new SQL/keyring capability preflight succeeds; config absence disables connection controls without breaking normal panel initialization. Webhook path uses verified provider secret, not merchant cookie.
- [x] **Step 4 — GREEN:** Targeted HTTP/runtime tests and panel/data typecheck PASS. Existing Google HTTP/connection and customer parsing tests PASS; late failure preserves typed selection and retry key. Server private data never crosses public root index into client component imports.
- [x] **Step 5 — Commit:** `feat: expose tenant-safe email marketing connection APIs`.

## Task 7: Simple connection screen and official logos

**Files:** Create panel `components/email-marketing/{EmailMarketingConnections,EmailMarketingConnectDialog,ProviderBrand}.tsx`, `email-marketing.module.css`, `EmailMarketingConnections.behavior.test.ts`; `lib/email-marketing-ui/{client,state}.ts`, tests; `public/brands/{brevo,klaviyo}.svg`. Modify email page and package.json test globs. Create `app/marketing/email/history/page.tsx` preserving old console, `docs/ops/email-marketing-brand-assets.md`.

**Interfaces:** `createEmailMarketingApi(fetcher=fetch,uuid=crypto.randomUUID)` mirrors Task2 methods with same-origin/no-store. `EmailMarketingConnections({canManage:boolean,configured:boolean})` lazy loads overview and opens dialog. `ProviderBrand({provider:EmailMarketingProvider})` renders decorative local logo with adjacent accessible provider text, height24px/max-width120px, original aspect. Dialog draft lives in memory, keeps selected list/operationId through retries, clears key on close.

- [x] **Step 1 — RED:** Behavioral tests assert two provider cards, local logo paths and meaningful names, no repeated visible title, only integrations.manage can mutate. Validate/list/Uygula, new-list choice, double-click, failed Apply retry same key, stale response after switching provider ignored, candidate expiry preserves chosen list. Disconnect warns external schedules remain; draining is visible. Read-only user can see status/history. Unknown sender/quota/blocked counts remain unknown. Logo safety test rejects scripts/events/external URLs/fonts/foreignObject and invalid namespace, while retaining necessary proprietary notices.
  Test `brand_and_recovery_are_accessible`: DOM fixture'da `assert.equal(document.querySelectorAll('img[src="/brands/brevo.svg"]').length,1); assert.equal(document.querySelectorAll('img[src="/brands/klaviyo.svg"]').length,1); assert.equal(secondApplyOperationId,firstApplyOperationId); assert.equal(selectedListId,originalListId);` — gerçek etkileşim testinde hata ve tekrar düğmesi çalıştırılır.
- [x] **Step 2 — Run RED:** Panel `node --experimental-transform-types --test lib/email-marketing-ui/*.test.ts components/email-marketing/*.behavior.test.ts`; missing component/client FAIL.
- [x] **Step 3 — Implement:** Cards display current setup/sync/error and buttons “Hesap oluştur”, “Bağla”, “Kampanyaları aç”; central dialog API key→account/list→Uygula/Vazgeç, existing account details and eligible count. One active provider; list/account switch shows cleanup status. Campaign URL is static official allowlist. Keep route/history links for old records, including existing new/edit pages; no automatic provider campaign migration. Update misleading draft intro and use existing shell/buttons/modal/neutral palette.
- [ ] **Step 4 — Brand assets:** Obtain exact official Brevo dark SVG from press link `https://corp-backend.brevo.com/wp-content/uploads/2023/04/Brevo-Logo-1.svg`; obtain current Klaviyo wordmark/flag from newsroom header `https://www.klaviyo.com/newsroom`. Record source,date,hash and applicable brand usage scope in provenance. Brevo ToS8.2/press invitation leave integration-use permission unverified; establish express usage scope before publishing that asset, without sending provider messages unless human authorizes them. Do not fabricate/recolor substitute logos or claim endorsement. Inspect SVG then serve locally; API terms/newsroom rules govern Klaviyo use.
- [x] **Step 5 — GREEN:** Tests/typecheck PASS; real rendered 1440/1024/390 keyboard/focus/modal/error preservation QA. Opening other admin routes makes zero requests for provider logos/API and adds no email chunk. User credentials and customer PII are excluded from screenshots. Verify absence of hotlinks and unsafe SVG behavior, not implementation-mirroring image snapshots.
- [x] **Step 6 — Commit:** `feat: add branded email service connections to marketing`.

Task 7 Step 4: official assets/provenance are complete; external publication permission/registration gates remain open, so the combined checkbox stays unchecked.

## Task 8: Acceptance, performance and shared rollout

**Files:** Create `docs/ops/email-marketing-connections.md`, `docs/qa/evidence/email-marketing-connections/acceptance.md`, candidate migration manifest; update plan checkboxes only with evidence. No shared ref/pin/deploy queue changes before release coordination.

**Interfaces:** Consumes completed Tasks1–7, source SHA, allocated migration ID, explicit fixture/test-account scope. Produces deployment/rollback manifest containing source and exact target/container revision, migrations, configuration fingerprints (not secret values), worker mode and acceptance evidence.

- [ ] **Step 1 — Fresh authority:** Read current shared release/artifacts and pending publications. Reuse suitable managed checkout; incorporate only reviewed compatible upstream changes if 8ec is stale. Read referenced Mira chat before relying on it; preserve user's earlier authorization to coordinate publications. Acquire one release owner, allocate next SQL ID and capture guarded current function/ACL/config baselines. Confirm owner and both panels have required encryption ring via secret-only server settings; never paste credentials into chat/evidence.
- [ ] **Step 2 — Isolated acceptance:** Full SQL up/replay/empty rollback/reapply and populated rollback refusal; HTTP/database tenant separation; no legacy grant fabrication; 205-profile bootstrap; ret/archive/address switch; async/recovery/draining/rotation; all Review Focus cases. Real sandbox accounts separately verify Brevo and Klaviyo identity/list/new profile/existing suppression/ret/readback/sender status. Merchant keys and permitted recipient/automation scope are required before real mutations; never use arbitrary production customers to seed test data. Missing keys leave real acceptance explicitly pending.
- [x] **Step 3 — Relevant regression gate:** Run contracts,data,panel,owner,storefront-shared typechecks; targeted new tests plus existing customer/source/Google/manual-sales/payment/order-email/popup/restock/review tests. Build panel,owner,storefront-shared sequentially from known source. Builds do not confirm live provider acceptance. Avoid unrelated optional suites unless a gate or concrete failure requires them.
- [x] **Step 4 — Performance:** In isolated workload use same seeded store/profile distribution, same requests and at least1000 requests after warm-up for off/full comparison, repeat3times. Record p95 panel response, event save latency, CPU/RAM, pool wait, provider call rate, queue age and per-store fairness. Repeatable >10% p95 regression fails release. UI request must never wait for bootstrap/polling; source save writes only local event/outbox. Inspect indexes/query plans on audience/job claims and fix concrete scans before rollout.
- [ ] **Step 5 — Publish compatibility:** Back up and rehearse recovery in isolation; guarded native SQL first. Publish owner with compatible revoke-only worker; publish affected shared storefront readers NET→SITE if Task3 data wrappers require package/runtime update. Then shared Customer Panel NET→SITE. Preserve all unrelated env, SQL, payment and Google integration state; re-read exact running sources after each target and stop on failure. Enable full worker only after typed readers and isolated acceptance pass; merchant Uygula chooses real account/audience.
- [ ] **Step 6 — Live acceptance:** Four known stores (Güzide,Alpler,Lilyum,Butik Siora) show shared feature with correct permissions; new tenant receives screen through common app, no per-store installation. No-account stores show setup and cause no export/API calls. On merchant-authorized connected test store verify visible account/list, actual provider state and ret. No campaigns sent by Celebix and no fake financial/sales records. Report software-live and provider-acceptance status separately.
- [ ] **Step 7 — Rollback and report:** Turn off grant/import via `revoke_only`, preserve ret/hook/readback/cleanup; revert only compatible UI/source if necessary. If ret worker cannot run, external sends must be paused and pending ret applied before rollback is complete. Retain necessary evidence/audit/sealed secret until draining completes, then destroy secret. Record actual measured results, remaining external setup/brand permission limits and exact source. Commit `docs: record email marketing connection acceptance and rollout`.

Task 8 partial evidence: isolated Step 2 and read-only release preparation passed; real provider acceptance, numbered release, activation/live acceptance and final rollout/rollback report remain pending. No Task 8 completion claim.

## Self-review and execution handoff

- Spec coverage: Task1 contracts/crypto; Task2 connection isolation/commands/audit; Task3 all three consent producers and historical proof/cursors; Task4 provider capabilities; Task5 ret/async/recovery/polling/worker; Task6 tenant-safe runtime; Task7 shared UX/history/logos; Task8 tests/performance/rollout/recovery/new tenants.
- Explicit limits: no campaign editor/send API, no native revenue reports, no catalog/order/cart-event export, no MailerLite/Sender activation, no invented sender quota or asset license. User-directed logo work is included, its primary-source usage scope is a publication prerequisite.
- Review Focus cases are assigned to named RED/acceptance steps. Interfaces use the same repository/adapter/candidate names in later tasks. New customer evidence does not change old public read payloads or transfer ownership.
- Recommendation: **Subagent-driven**, because consent, secrets and asynchronous provider effects need independent review at each task boundary before connecting live stores. Human must review this written plan and choose/confirm execution method before implementation under `superpowers:writing-plans`.

## User-directed correction — manual synchronization (2026-10-09)

This correction is explicitly authorized by the user's manual-only request and consent-provenance answer. Implement a sync command/route/button; remove Apply bootstrap and grant/name fanout; freeze each request's audience/names; retain denials/readback/cleanup; test retry/version/uncertainty, historical proof and large list queue construction. This local correction does not clear the outstanding real-provider/publication gates of Task 8.
