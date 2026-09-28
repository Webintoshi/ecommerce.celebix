# Automatic Store Onboarding Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. Root owns live infrastructure, credentials, migrations and releases; workers handle bounded source/test tasks. User approved execution; checkboxes below record verified completion only.

**Goal:** Kayıt ve doğrulama sonrasında doğru admin/storefront erişimini sağlamak; kesintilerde aynı işlemi güvenli sürdürmek ve gerçek kurulum durumunu göstermek.

**Architecture:** Mevcut ortak Owner/customer-panel/storefront uygulamaları ve PostgreSQL tenant otoritesi korunur. Kalıcı job/access kayıtları, mevcut transaction/idempotency/lease korumaları ve ayrı status-only browser proof'u kullanılır. Merchant satış hazırlığı, teknik mağaza açılışını başarısız saydırmaz.

**Tech Stack:** Mevcut Next.js16.2.1, React19.2.3, TypeScript5.9, PostgreSQL16, Logto1.41.0, Coolify/Traefik3.6, Cloudflare; yeni queue vendor veya framework gerekmez.

**Spec:** `docs/superpowers/specs/2026-09-27-automatic-store-onboarding-completion-design.md`

## Global Constraints

- Spec'in Sabit gereklilikler bölümü tüm görevler için geçerlidir.
- Mevcut kayıt/mağaza tekrar oluşturulmaz; Alpler Spor mevcut hesabıyla doğrulanır.
- Kimlik doğrulama, email verification, immutable issuer/subject, exact-host trust, TLS, üyelik ve tenant isolation korunur.
- Aynı işlem özgün tenant payload, idempotency key ve canonical fingerprint ile sürdürülür.
- `recoveryAbsentAt` süreye veya tek bir SELECT sonucuna bakılarak temizlenmez.
- Worker yalnız kalıcı doğrulanmış kimliği olan işlemleri tamamlar; oturum veya handoff oluşturmaz.
- Kayıt sonucu, erişim sonucu ve işletmenin satış ayarları ayrı tutulur; mevcut `provisioningStatus: "ready"` sözleşmesi değiştirilmez.
- Parola/kod/ham credential/API anahtarı dosya, test, rapor veya loglara yazılmaz.
- Mevcut merchant tasarımları/sürümleri, alan adları, ödeme bayrakları ve preview değerleri korunur.
- Gerçek sipariş, ödeme, ücretli plan veya pazarlama işlemi yapılmaz.
- Customer panel ekranları mevcut tasarım sistemini ve `apps/customer-panel/AGENTS.md` kurallarını korur.
- Yeni SQL ordinal'ları bu kaynakta167/168/169 olarak planlandı; uygulamaya başlamadan önce repository ve canlı catalogue kontrol edilir. Çakışma varsa sonraki boş ordinal alınır ve planın dosya referansları önce güncellenir.

## Review Focus

1. Eski transaction recovery SELECT'ten sonra commit eder: aynı key üzerinden replay; çift mağaza yok (Görev2).
2. Worker tick sürerken süreç/DB bağlantısı kesilir: aktif lease zorla kaldırılmaz, başka worker güvenli devam eder (Görev2–3).
3. Status cookie/callback süresi dolar veya başka browser'dan istek gelir: durum yetkisi korunur, session/code replay yok (Görev4).
4. Generic HTTP200 farklı tenant veya yanlış router'dan gelir: exact domain/store health eşleşmeden ready yok (Görev1–3).
5. Sağlayıcı bağlı ama teslimat ücreti/canlı ödeme otoritesi yoktur; data read başarısızdır: yanlış tamamlandı/boş sonuç yok (Görev5–6).

## Teslim sırası ve iş dağılımı

| Sıra | İş | Bağımlılık | Kabul sonucu |
|---|---|---|---|
| 1 | Ortak TLS/routes + verifier | Cloudflare son kapsam onayı, Chrome bağlantısı | Alpler iki adresi geçerli HTTPS; unknown404 |
| 2 | Güvenli fenced retry | Mevcut kalıcı completion protokolü | Eski/geç commit yarışında tek tenant |
| 3 | Kalıcı jobs, worker ve erişim snapshot | 2; canlı erişim kanıtı için1 | Restart sonrası kayıt devamı, gerçek ready |
| 4 | Status proof ve devam ekranı | 3'ün DTO/ports; kaynak çalışması2–3 ile paralel | Yenileme/kesintide mevcut kayıt durumu |
| 5 | Teslimat ücreti editörü | Mevcut merchant-admin SQL/API | Ücret+gün save/load/checkout uyumu |
| 6 | Gerçek `/setup` listesi | 3 ve5; mevcut tenant-scoped ports | Her eksik için çalışan sonraki adım |
| 7 | Ölçüm ve operator görünümü | 3 | Takılan işler görülebilir, güvenli retry |
| 8 | Entegrasyon, canlı yayın ve son kabul | 1–7 | Kanıtla doğrulanmış uçtan uca akış |

Root1/8'i yürütür. Recovery worker2/3, UI/status worker4, checklist/delivery worker5/6 bağımsız dosya sahipliğiyle çalışabilir; ortak SQL ve contract dosyaları tek entegratör tarafından birleştirilir. Canlı işleri paralel dağıtım kuyruğuna körlemesine atmayın. Süre taahhüdü yerine her satırın kabul sonucu teslim ölçütüdür.

---

### Görev 1 — Ortak HTTPS ve doğru readiness verifier

**Files:** Modify `scripts/verify-tenant-wildcard-readiness.mjs`, `scripts/verify-tenant-wildcard-readiness.test.mjs`; evidence `docs/qa/evidence/automatic-store-onboarding/`; private server candidates `/root/celebix-onboarding-20260927/staging-wildcard-compose.yml`, `staging-wildcard-routes.json`.

**Interfaces:** `runTenantWildcardReadiness(rawArguments, dependencies?)` mevcut tek argüman çağrılarını korur. Test injection `probeHttp(hostname, path)` ve `probeCertificate(role, hostname)` kabul eder; gerçek default'lar değişmez. Merkezi panel `/login`, tenant health `/api/health` kullanır.

- [x] Önce runner regression ekle: SITE/NET/production profile merkezi panel için `/login` ister; bilinmeyen tenant404 kabul edilir, farklı route/body/domain authority reddedilir. Örnek temel assertion: `assert.equal(panelProbe.path, "/login")`.
- [x] `node --test scripts/verify-tenant-wildcard-readiness.test.mjs` çalıştır; yeni path regression mevcut kodda FAIL olmalı.
- [x] Minimal path düzeltmesi ve injectable probes uygula; aynı komut PASS, mevcut evaluator regresyonları korunmalı. Commit: `fix: verify central panel readiness through login`.
- [ ] Chrome bağlantısını düzelt; onaylı son NET/SITE DNS Write/Zone Read + yalnız sunucunun IPv4/IPv6 token kapsamını inceleme ekranında doğrula. Açık onay olmadan token oluşturma.
- [ ] Token'i güvenli yolla0600 sunucu dosyasına aktar; stdout, CLI argument, clipboard history ve repo içine yazma. Server-origin Cloudflare validation ve DNS izinlerini doğrula.
- [ ] Fresh compose/dynamic/ACME private backup al; mevcut8URL PASS, compose drift guard ve `docker compose ... config --quiet` PASS olmadan kurma. Mevcut resolver/image/routes korunarak root guarded proxy kurulumunu yap.
- [ ] Dört wildcard SAN/expiry, valid chain, strict hostname routing ve mevcut mağazaları doğrula. Unknown admin/storefront404; no TLS bypass. Sanitized before/after kanıt kaydet.

**Kabul:** NET/SITE verifier PASS; Alpler admin/storefront HTTPS ve mevcut8URL sağlıklı. Token onayı/uzantı bu görevi bloke ederse2–7'nin kaynak işleri sürebilir; altyapı tamamlandı denmez.

### Görev 2 — Fenced kayıtları aynı işlemle güvenli sürdürme

**Files:** Modify `apps/owner/lib/self-serve-registration-completion.ts`, `.test.ts`; `apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts`, `postgres-verified-identity-workflow.test.ts`. Create `tests/saas-phase2/onboarding-resilience/recovery-postgres.test.mjs`. Reference existing `packages/saas-data/src/postgres/recovery.ts`, `repository.ts`, Tenant Core tests and SQL012/013/014.

**Interfaces:** Store `claimTenantCompletionRecovery({attemptId, expectedWorkflowVersion, expectedCompletionVersion, now}) -> CompletionClaimOutcome`; service `resumeRecoveredTenantCreation(attemptId) -> ResumeTenantCreationResult`. Expose a separate internal recovery port; ordinary HTTP completion/callback cannot bypass the fence.

- [x] Yeni unit regressions: ordinary resume remains fenced; guarded recovery ready→creating marker'ı korur; stale versions/busy lease reddedilir; committed replay, rollback ve commit_unknown sınıfları korunur; release-before-finalize sırası assert edilir.
- [x] `node --conditions=react-server --experimental-transform-types --test apps/owner/lib/self-serve-registration-completion.test.ts apps/owner/lib/saas-persistence/postgres-verified-identity-workflow.test.ts` çalıştır; yeni davranış FAIL olmalı.
- [x] Existing workflow lock/version/immutable identity checks ve nonblocking session advisory try-lock ile dedicated claim ekle. Busy rollback hemen yapılır. Exact persisted payload/key/fingerprint kullan; existing Tenant Core unique-key arbitration ve proof finalizer korunur. Retry için SQL grant/constraint gevşetme.
- [x] Unit suite PASS; mevcut same-key/core replay testleri PASS. GerçekPG16 iki bağlantı testi: eski uncommitted writer commit, rollback ve retry başladıktan sonra late start; her vakada en fazla1store/owner/subscription/domain/media/default tasarım seti ve doğru operation proof.
- [x] QA harness yalnız task-owned disposable DB ve explicit izinli database name ile çalışır; live DB URL/roles'a karşı çalışmayı reddeder. Commit: `feat: safely resume fenced registration completion`.

**Kabul:** Recovery hiç yeni idempotency key üretmeden tamamlanır; lease/row-lock inversion deadlock yok; belirsiz sonucu force-reset etmez.

### Görev 3 — Kalıcı worker, access snapshot ve restart dayanıklılığı

**Files:** Create SQL `apps/owner/scripts/sql/saas/202609270167_registration_onboarding_jobs.{up,down}.sql`, `_assertions.sql`, `registration-onboarding-jobs-migration.test.ts`; `apps/owner/lib/onboarding-jobs/{types,postgres-repository,worker,access-probe,default}.ts` ve eş testler; `apps/owner/scripts/onboarding-worker.mjs`, `.test.mjs`. Modify Owner `saas-persistence/postgres-registration-attempt-store.ts`, `self-serve-registration-orchestrator.ts`, `self-serve-auth-route-runtime/runtime.ts`, `apps/owner/scripts/start-production.cjs`. Targeted modify `apps/customer-panel/lib/server-admin-domains/origin-health.ts` ve mevcut storefront runtime initializer yalnız transient negative-cache regresyonu varsa.

**Interfaces:** `OnboardingJobRepository` claim/CAS/finish; `runOnboardingTick({scope,now,limit}, deps) -> sanitized counts`; `probeTenantAccess(authority, expectedTenant) -> ready|pending|unavailable`; `OnboardingAccessSnapshot {attemptId, storeId, checkedAt, state, safeCodes}`. Scope, yeni attempt'in original validated registration transaction'ında immutable kaydedilmiş Owner/panel origin ve platform suffix'ten gelir. Görev4/6 minimum safe snapshot okur.

- [x] Contract/repository/worker regressions yaz: registration begin→immutable scope ve verified identity→durable job atomik; aynı attempt tek job; awaiting identity çalıştırılmaz; NET worker SITE attempt'i claim etmez; legacy scope proof missing/mismatched ise fail closed; restart/expired job lease recovery; 10attempt/backoff/attention; active completion lease pending; wrong tenant200 never ready; startup DB failure→recovery without restart.
- [x] Odaklı yeni tests çalıştır ve FAIL kaydet; SQL authority/grant/RLS tests boş durum dahil başarısızlığı doğru nedenle göstermeli.
- [x]167 ile immutable registration authority scopes, jobs/access snapshot/scope heartbeat persistence ve minimum guarded functions ekle. Original validated authority yeni attempt başlatan transaction'da saklanır; constructor/runtime/orchestrator scope wiring güncellenir. Heartbeat45s sonra degraded'dır. Job durable verified transition ile atomik üretilir. Legacy scan yalnız persisted OIDC authority veya matching committed canonical domain proof varsa scope bağlar; kanıtsız eski işi scanning worker'ın ortamına atamaz. `FOR UPDATE SKIP LOCKED` kısa job transaction'ında; network/tenant execution bu transaction dışında.
- [x] Worker defaults tick15s/batch25/concurrency2/lease60s; retry15/30/60/120/300s, cap10; stale lease scheduling CAS'i ve completion lease birlikte korunur. Fenced ready için Görev2 recovery port'u çağrılır; worker session/handoff modüllerini çağırmaz.
- [x] Access checks: committed tenant proof/active owner/subscription/namespace/valid published starter/exact domains; ardından allowed-host DNS/TLS/login/health/public GET. Timeout5s/body256KiB/same-host max1redirect. Correct store/host health sonucu bellekte assert edilir; generic200 yeterli değildir. Snapshot TTL5min ve due refresh uygulanır.
- [x] `CELEBIX_ONBOARDING_WORKER_ENABLED` strict false default; mevcut Owner startup supervisor worker child'ı yönetir, bounded crash backoff/signal cleanup sağlar. Web uygulamasının çalışması ve worker degraded health ayrı gözlenir; invalid worker config hazır görünmez. NODE runtime script'i yeni servisi desteklemezse deployment öncesi package/source availability gate başarısız olmalıdır.
- [x] PG16up/down/up+role assertions, restart fixture ve worker supervision tests PASS. Owner typecheck/build PASS. Commit: `feat: persist onboarding recovery jobs and access checks`.

**Kabul:** Süreç yeniden başlasa da iş kaybolmaz; unknown/mismatched host hazır olmaz. Sağlıklı düşük yük fixture'ında verification→ready≤60s; gerçek gecikme ayrıca ölçülür.

### Görev 4 — Güvenli durum cookie'si, ekranı ve callback devamı

**Files:** Create SQL `apps/owner/scripts/sql/saas/202609270168_registration_status_bindings.{up,down}.sql`, `_assertions.sql` ve migration test; `apps/owner/lib/self-serve-status/{types,credential-codec,cookie,postgres-repository,handler,presentation}.ts`, testleri; `apps/owner/app/api/self-serve/status/route.ts`; `apps/owner/components/self-serve/OnboardingStatus.tsx`. Modify Owner `panel-browser-binding/postgres-repository.ts`, `start-executor.ts`, `self-serve-browser-bound-registration/handler.ts`, `self-serve-auth-route-mount/route-set.ts`, `self-serve-auth-composition/composition.ts`, `self-serve-auth-route-runtime/runtime.ts`, `app/onboarding/status/page.tsx`; Owner `panel-session-handoff/internal-callback-handler.ts`, `initial-callback-executor.ts`, `internal-response.ts`; Panel `lib/panel-session-completion/{completion,transport}.ts`, `lib/panel-auth-composition/composition.ts`, `lib/panel-auth-route-runtime/runtime.ts` authority wiring ve ilgili tests.

**Interfaces:** Spec `OnboardingStatusDto`; status-only `issueBootstrapWithStatus(...)` atomik wrapper ve `readStatus(cookie, now) -> DTO|expired|unauthorized|unavailable`. Yeni internal result HTTP202, canonical body key order `schemaVersion,kind,statusUrl`, `schemaVersion:1`, `kind:"onboarding_pending"`; statusUrl yalnız configured exact Owner `/onboarding/status`. Existing response signature domain/body/status authentication, initial grant/session variants ve exact response validators korunur.

- [x] Testler:32byte/purpose-separated codec; raw token persistence yok; Owner-only cookie24h/no sliding expiry; başka cookie/origin/attempt hint ve doğru token/yanlış NET-SITE scope unauthorized; GET session/provisioning/handoff üretmez; pending callback pre-auth cookie silinse bile Owner status cookie durur; expired status401; read failure503; malformed/unsigned/wrong-status/wrong-key-order202 redirect reject; slow dependency/deadline exhausted pending, handoff/session issuer çağrılmaz, grant dispose edilir; old Owner/new Panel ve new Owner-emission-disabled/old Panel uyumu.
- [x] Yeni unit/HTTP/SQL testleri çalıştır; mevcut redirect stub ve status binding eksikliğinden FAIL bekle.
- [x]168 ile yalnız status digest/attempt/expiry/revocation kaydı ve restricted functions ekle. Existing SQL017 state-digest→workflow bağlama protokolü kullanılarak bootstrap ve status binding aynı transaction'da oluşturulur; ordinary `createBootstrap` contract callers compatibility korunur. Expiry+1h geçmiş status digest binding'leri bounded cleanup ile kaldırılır; durable workflow/identity/operation/job silinmez.
- [x] Owner handler cookie'yi yalnız committed bootstrap/status sonucu ile gönderir. GET DTO no-store/no-referrer ve safe codes; raw credential URL/localStorage/response JSON/loglara gitmez. Login/storefront URL yalnız ready/exact authority'den üretilir.
- [x] Ekran awaiting_identity/creating/checking_access/ready/attention_required/expired/failed gösterir. Poll5s, unavailable15s, hidden/terminal'da durur. Worker veya status GET identity verification/session üretmez. `initial-callback-executor` handoff'tan önce fresh ready snapshot'ı kalan mevcut5s transport bütçesinde en fazla100ms okur; DNS/TLS/network probe ve deadline artırımı yok. Bütçe yok/ready değilse issuer çağrılmadan pending fixed status'a yönlenir, grant dispose edilir; ready'de fresh exact-destination returning login sunulur. `CELEBIX_ONBOARDING_STATUS_ENABLED` false default, runtime/composition yalnız onaylı scope ve compatible consumer rollout ile aktive olur.
- [x] Eski Alpler attempt'ine proof'suz cookie oluşturulmaz. Expired verified/uncertain attempt yeni kayıt önermez; mevcut tenant normal login veya güvenli destek yönlendirmesi alır. Kesin verification-before-expiry durumunda normal yeni başlangıç mümkündür; OIDCcode/state replay yok.
- [ ] Browser fixture normal/pending/unavailable/expired cases PASS; owner+panel typecheck/build, auth/handoff regressions PASS. Commit: `feat: add durable onboarding status and safe continuation`.

**Kabul:** Yenileme callback'i tekrar tüketmez; başka kullanıcının durumunu açmaz; durum sayfası mağaza hazır olmadan bozuk hosta yönlendirmez.

### Görev 5 — Kullanılabilir checkout teslimat ücreti ayarı

**Files:** Modify `packages/saas-data/src/merchant-admin/validation.ts`, `repository.test.ts` ve ilgili canonical/HTTP tests; `apps/customer-panel/app/settings/shipping/page.tsx`. Create `apps/customer-panel/components/shipping/CheckoutDeliverySettings.tsx`, behavior test; `lib/checkout-delivery-ui/{model,client,presentation}.ts`, tests. Existing `server-merchant-admin/runtime.ts`, `/api/merchant-admin/records/[kind]` route/handler ve SQL072 authority kullanılır; gerekirse typed input validator dar kapsamda güncellenir. Yeni test grubunu customer-panel `package.json` runner'a ekle.

**Additional SQL files:** `apps/owner/scripts/sql/saas/202609270169_checkout_delivery_days.{up,down}.sql`, `_assertions.sql` and migration test. Isolated PG16 revealed a persisted validator chain limiting days to90; override only optional shipping days integer1..365 and delegate other validation. Existing records are not rewritten.

**Interfaces:** `CheckoutDeliverySettings {shippingPriceCents:number, estimatedDays?:number}`; load/save mapper mevcut record config'in diğer izinli alanlarını korur. List/save mevcut version/idempotency/authorization protokolüyle `shipping_setting` kullanır.

- [x] Round-trip regression yaz: repository ücret1489kuruşu kabul eder ve checkout1489 gösterir; explicit0 ücretsizdir; missing fee yeni UI submission'da reject; gün1/365 kabul,0/366/fraction reject; stale version409; configuration.manage yoksa mutate edilmez. BasitKargo connection console mevcut davranış testi korunur.
- [x] Odaklı repository/merchant HTTP/UI tests çalıştır; TS allowed-key gap nedeniyle yeni fee test FAIL olmalı.
- [x] Typed allowed keys/fee validation'ı SQL072 ile eşleştir: integer0..100,000,000; `estimatedDays`1..365. Editor explicitfee, optionaldays ve draft/activation aksiyonu kullanır.0 için “Ücretsiz teslimat”; Türkçe ondalıklı tutar mevcut para parser'ıyla kuruşa çevrilir, float rounding kullanılmaz.
- [x] BasitKargo konsolunun yanında ayrı editör göster; MerchantModuleConsole veya legacy donor UI geri getirme. Regions/threshold alanlarını checkout tarafından uygulanan seçenek gibi sunma; mevcut config alanlarını ve checkout davranışını topluca değiştirme.
- [x] PG16 merchant save/load + checkout projection testi PASS; UI behavior ve panel typecheck/build PASS. Commit: `feat: configure checkout delivery fees in shipping settings`.

**Kabul:** Kurulum listesinin kargo linki gerçekten fiyatı tanımlayabilir; provider bağlantısı fiyat hazırlığı yerine geçmez.

### Görev 6 — Gerçek tenant-scoped `/setup` listesi

**Files:** Modify `apps/customer-panel/app/(panel)/setup/page.tsx`, `package.json`; create `lib/server-setup/{types,loader,default}.ts`, tests; `lib/setup-ui/{presentation,model}.ts`, tests. Existing server-access, server-catalog, server-storefront-design, server-store-domains, server-merchant-admin, server-payment-methods ve server-provider-execution ports kullanılır.

**Interfaces:** `loadSetupStatus(context:TenantContext) -> {access, products, design, domains, delivery, payment}`; item states `ready|action_required|unavailable|restricted`, safe action URL ve optional recommendation. Görev3 snapshot read exact store scope'u korur.

- [x] Loader/presentation regressions: doğru mağaza; zero products action_required; valid blank starter design ready; unpublished changes ayrı; no optional logo blocker; active fee kaydı readiness; provider-only bağlantı delivery ready yapmaz; test-only/disabled storefront execution live payment ready yapmaz; failed reads unavailable, izin/plan restricted.
- [x] Yeni testleri ayrı pure/server koşullarıyla çalıştır, hardcoded setup mevcut davranışı yeni assertion'ları geçmemeli.
- [x] Aggregate yalnız mevcut server-established context ve yetkili bounded ports ile oluşturulur. Mutation/provider çağrısı yok; farklı storeId query/body'den alınmaz. Payment sonucu offline/configured/test/live/unavailable ayrımını gerçek admin+storefront execution authority ile yansıtır; permissions/scopes açılmaz.
- [x] Mevcut sayfa iskeletinde gerçek kısa durumlar ve çalışan `/products/new`, `/settings/design`, `/settings/domains`, `/settings/shipping`, `/settings/payment` aksiyonları gösterilir. Semantik başlık erişilebilir, görünür tekrar başlık yok.
- [x] Tenant isolation/permission/error davranış tests ve panel build PASS. Commit: `feat: show truthful store setup readiness`.

**Kabul:** Kullanıcı tamamlanmamış işlemi tamamlandı görmez; boş katalog/opsiyonel logo hesabı başarısız saydırmaz.

### Görev 7 — Takılan işleri görünür kılma ve güvenli operator retry

**Files:** Create Owner `lib/onboarding-jobs/audit.ts`, tests; `lib/onboarding-operations/{service,http,presentation}.ts`, tests; `app/onboarding/operations/page.tsx`, `app/api/internal/onboarding/operations/route.ts`. Modify `self-serve-auth-route-runtime/runtime.ts` no-op completion audit ve worker factory; mevcut `owner-auth.ts` super-admin gate reuse. PG167 restricted job/snapshot functions kullanılır.

**Interfaces:** `getOnboardingOperations(scope, now)` aggregate counts/oldest age/worker heartbeat; `requestOnboardingRetry({jobId,expectedVersion}, superAdminAuthority)` aynı durable CAS service'e gider. Safe log only stage/code/retry/age/purpose-separated HMAC correlation.

- [x] Testler: super-admin dışında403; origin/CSRF/version mismatch reddi;5min warning/15min alert; ham email/state/code/password/key/credential hiçbir log/DTO'da yok; retry job limit reset etse de key/fence/proof değişmez; active lease işini force devralmaz.
- [x] Yeni tests FAIL→minimal uygulama→PASS. Operator görünümü durum/age/son güvenli hata/sonraki retry ve bounded manual retry gösterir. Harici mesaj/e-posta göndermez; mevcut log/dashboard alarm kanalını kullanır.
- [x] Owner typecheck/build ve permission tests PASS. Commit: `feat: expose onboarding recovery operations`.

**Kabul:** Takılan süreç fark edilir; operator tekrar denemesi güvenlik korumalarını atlamaz.

### Görev 8 — Entegrasyon, yayın ve uçtan uca kabul

**Files:** Create `tests/saas-phase2/onboarding-resilience/acceptance-fixture.mjs`, `docs/qa/onboarding-resilience-browser-acceptance.md` browser checklist/harness instructions; update `docs/qa/automatic-store-onboarding-release-2026-09-27.md`, evidence directory, this plan checkboxes. Browser UI işlemleri mevcut oturumun CUA aracıyla yapılır; shell üzerinden alternatif browser automation başlatılmaz. Infrastructure private release helpers fresh baseline ile hazırlanır; eski hardcoded deployment snapshot tekrar kullanılmaz.

- [x] Root bütün görevlerin source/spec uyumunu ve dependency seams'i bağımsız review ile denetler. Gerekli focused tests PASS; owner/customer-panel ve değişen shared package consumer storefront typecheck/build PASS. Belgesel değişiklik için gereksiz ürün testleri çalıştırılmaz.
- [x] Fresh task-owned PG16 QA restore'da167/168/169 up/assertions/down/up, roles/isolation ve önceki merchant row/design/domain hashes korunması doğrulanır. Recovery tests gerçek2connection interleaving ile geçer. Aktif proof/job varken destructive down SQL canlıda çalıştırılmaz.
- [ ] NET/SITE izole browser fixture: fresh signup→email verification fixture→creation→status→login→setup→public storefront; ikinci submit, consumed callback reload, process restart, DB timeout/unknown commit, existing email/slug conflict, expired proof, wrong browser/store test edilir. Fake provider/email gerçek Logto teslimatı kanıtı olarak sunulmaz.
- [x] İzole merchant repository aşamaları salt okunur başlangıç ve aynı sentetik grafikte tek kontrollü devam olarak ilk taslak ürün/görsel/yayımlanmış tasarım/delivery fee testlerinden geçer:4pass/0fail/3başka-mod-skip. Kayıt grafiği ve bildirim ayarı korunur; gerçek ödeme/sipariş/provider execution yok. Kaybolan bütün fresh süreç makbuzu başarılı sayılmaz.
- [ ] Gerçek Alpler hesabı normal returning login ile admin/products/design/setup ve public starter'da doğrulanır; yeniden kayıt açılmaz.
- [x] Fresh private DB+Coolify encrypted config+proxy backups; reviewed exact SHA ve generated payment candidates hesaplanır. Önceki scoped onayların yalnız kaynak/digest bağları güncellenir; NET/SITE Owner/shared farklı baseline izinleri ve bütün preview değerleri guard ile korunur. Payment adapters/generator değişmemişse diff/hash kanıtı kaydedilir.
- [x] Geriye uyumlu additive migrations uygulanır. Önce NET/SITE Panel yeni202 reader'ları, shared storefront consumer'ları, sonra Owner emitter source'u resmi Coolify kuyruğunda sırayla yayınlanır. Altı dağıtım exact3de kaynağında finished; global kuyruk boş, shared4+Owner2 config guardPASS.
- [x] Running image/SOURCE_COMMIT/source hashes/compiled routes/payment authority son altı hedefte yeniden doğrulanır; gözlenen runtime major sürümü hedefin frozen packaging kaynağına bağlıdır. Panel43/45, Storefront27/27, Owner72/74 zorunlu kaynak hash'i; yalnız iki belirli build-only omission ayrıca/null kaydıyla raporlandı. Actual6/6PASS; Owner flag'leri false.
- [ ] `CELEBIX_ONBOARDING_STATUS_ENABLED` ve worker normal NET/SITE env'de compatible consumer ve wildcardTLS kanıtından sonra kontrollü açılır; preview ve unsupported production modları kapalı kalır.
- [ ] Valid TLS wildcard CLI, mevcut8URL, Alpler normal tarayıcı giriş+storefront, worker heartbeat/job recovery ve truthful setup PASS. Sağlıklı verification→ready gecikmesi ölçülür; tek tenant/owner/subscription/domain/media/design seti kanıtlanır.
- [ ] Rollback gerekirse önce Owner yeni-status emission ve worker flag kapatılır; sonra emitter/consumer exact önceki image+env bindings geri alınır. Yeni Owner emitter eski Panel reader ile çalıştırılmaz. Attempt/job/proof korunur, SQL state reset/delete yapılmaz. Proxy geri dönüşü task-owned config/dynamic adayını kaldırıp private başlangıç yedeğine guarded dönüştür; mevcut cert deposu silinmez.
- [x] Sanitized kanıtları commit/push; geçici QA'yı yalnız task-owned kapsamda kapat, container/volume içindeki grafikleri ve recovery backups/receipts0600 koru. QA exited/exit0/OOMfalse; volume ve container tutuldu, SSH tüneli kapatıldı; bekleyen canlı kabul nedeniyle özel devam helper'ları ve çalışma dalı korundu. İlk stop runner'ı tam başarı sayılmadı; sonraki current-state/volume kanıtı PASS. Planın canlı TLS/aktivasyon/browser checkbox'ları açık kaldı.

**Son kabul:** Kayıt→doğrulama→tek mağaza→geçerli admin/storefront erişimi tamamlanır; kesintiden sonra aynı işlem güvenli sürer; kullanıcı gerçek durum/sonraki adımı görür; operatör bekleyen işleri izleyebilir. Bir gate eksikse hangi adımın beklediği açıkça raporlanır.

## Bugünkü dış bağımlılıklar

Cloudflare anahtarının son IPv4+IPv6 kapsam onayı Görev1 wildcard TLS ve gerçek browser kabulü için bekliyor; bu çalışmada anahtar oluşturulmadı. Son inceleme iki alan adı/DNS Write+Zone Read/iki sunucu IP'siyle hazırlandı. 29 Eylül yerel tarihine geçişten sonra Chrome bağlantısı artık araç envanterinde görünmüyor; yalnız boş in-app browser mevcut. Kaynak geliştirmesi, izole testler ve disabled-flag consumer-first yayın tamamlanabilir. Yeni gerçek canlı kayıt test kimliği gerekirse gerçek email verification kullanıcı koduyla tamamlanır; mevcut hesap/OTP yeniden kullanılmaz.

## 28 Eylül kaynak ve yayın kapıları

İncelenen uygulama sürümü `3de4bbcdb2808a97e4add42023356b0af2dae046` sabittir; sonraki `1a038a5d` yalnız QA test/report değişikliğidir. Üç uygulamanın bu sürümden izole Node20.20.2 üretim derlemesi başarılı; yeni Owner bundle `--check-runtime` kontrolü ağsız ortamda başarılıdır. Owner805/805, Panel server96/96, storefront doğru koşullara ayrılmış568/568 ve yeni odaklı/PG kontrolleri geçti. Panel ilk geniş test grubundaki19 hata ile1 skip devam eder; bağımsız baseline incelemesi ilgili kaynak/test girdilerinin değişmediğini gösterir ve testler gevşetilmedi.

Canlı167/168/169 up+assertions28 Eylül08:50:32UTC tamamlandı; on mevcut merchant tablosunun sayı ve tam satır hash'leri birebir korundu. Owner worker/status bayrakları false; wildcard TLS ve canlı kabul tamamlanmadan açılmaz. İzole merchant kanıtı ilk gerçek repository aşamaları, salt okunur ön kontrol ve aynı sentetik grafikte sınırlandırılmış teslimat devamı olarak ayrı raporlandı; tam fresh harness, gerçek OIDC/R2 veya ödeme yürütmesi başarılı olarak sunulmaz.

## 29 Eylül yerel tarihindeki yayın durumu

Altı resmi Coolify dağıtımı aynı `3de4bbc` kaynağında `finished`; global kuyruk boş. Panel→storefront→Owner sırası korundu. İki Panel'in çalışan yeni protokol/source/compiled consumer kontrolleri Owner kuyruğundan önce başarılıydı. Son shared4+Owner2 configuration guard başarılı; diğer şifreli nitelikler, bütün preview değerleri ve ödeme kapsamları korunuyor. [Dağıtım/config kanıtı](../../qa/evidence/automatic-store-onboarding/deployment-config-final-20260929.json).

Yerel `/tmp` doğrulama dosyaları ve önceki agent oturumları devam sırasında kayboldu; nedeni varsayılmadı. Sunucudaki özel migration/yedek/config kayıtları ve repository kaynakları korunuyor. Yeni salt okunur son doğrulayıcılar kalıcı özel klasörde yeni hash'lerle hazırlandı ve bağımsız incelendi. Son public8/8GET+statikform kontrolleri başarılı; gerçek tarayıcı/signed202/wildcardTLS kabulü sayılmaz. Proxy'nin dört dosyalık özel yedeği ve çalışan Owner imajının ağsız worker paket kontrolü PASS. Yeni izole merchant başlangıç salt okunur kanıtı ve aynı grafikte ürün/görsel/tasarım/teslimat devamı4/4PASS; bütün fresh kayıt sürecinin makbuzu kayıp olduğundan o süreç PASS sayılmadı. Gerçek wildcard TLS, worker/status aktivasyonu, heartbeat ve Alpler normal browser kabulü halen bekliyor. [Güncel yayın raporu](../../qa/automatic-store-onboarding-completion-release-2026-09-29.md).
