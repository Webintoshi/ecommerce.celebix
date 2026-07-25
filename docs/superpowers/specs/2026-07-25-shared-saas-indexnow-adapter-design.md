# Shared SaaS IndexNow Adapter Design

**Status:** Kullanıcı tarafından yazılı olarak onaylandı

**Date:** 2026-07-25

**Implementation base:** `27cdddedf6d4e37c1410e335d49ca18547496e85`

**Design branch:** `codex/saas-phase3-indexnow-adapter-design`

## 1. Amaç

Phase 3 provider-execution foundation üzerinde ilk gerçek sağlayıcı adaptörünü kurmak ve `/seo/fast-indexing` yüzeyini dürüst, tenant-safe ve kalıcı bir IndexNow iş akışına bağlamak.

Bu teslimat:

- yalnız doğrulanmış aktif canonical storefront hostname için URL bildirimi yapar;
- IndexNow doğrulama anahtarını mağaza veya browser girdisi olmadan Celebix sunucusunda üretir;
- anahtar dosyasını shared storefront üzerinden exact hostname ve exact path ile yayınlar;
- aktif merchant record, provider profile, credential version, plan ve storefront otoritesini immutable job snapshot'ında birleştirir;
- belirsiz dış yan etkilerde otomatik ikinci gönderim yapmaz;
- hiçbir başarı kanıtı olmadan kullanıcıya “indekslendi” iddiası göstermez.

Resmî protokol kaynağı: <https://www.indexnow.org/documentation.html>. Global endpoint ve güncel response açıklamaları: <https://www.indexnow.org/faq>.

## 2. Kapsamın ayrılması

Bu tasarım yalnız **P1 — IndexNow adapter** içindir. Aşağıdaki provider-gated yüzeyler bağımsız spec, sağlayıcı seçimi, sandbox ve consent/audience tasarımı gerektirir:

- e-posta teslimatı;
- telefon/SMS teslimatı;
- WhatsApp teslimatı;
- pazar yeri senkronizasyonu;
- fatura/muhasebe uzlaştırması.

IndexNow tamamlandığında çalışan özellik paritesi `78/86`, kapalı geçiş paritesi `81/86` ve kalan provider-gated yüzey sayısı `5/86` olur. Bu sayılar ancak kod, PostgreSQL ve ayrıca yetkilendirilmiş gerçek staging kanıtı tamamlandıktan sonra yükseltilir.

## 3. Sabit kararlar

1. Provider code `indexnow`, capability `indexing` olur.
2. Endpoint yalnız `https://api.indexnow.org/indexnow` olur; merchant tarafından değiştirilemez.
3. Her store/profile credential version için ayrı 64 karakter lowercase hexadecimal verification key üretilir.
4. Key browser, body, query, cookie, header veya `localStorage` kaynağından alınmaz.
5. Key üretimi ayrı, server-only 32-byte derivation authority kullanır; credential encryption key'i HMAC derivation için yeniden kullanılmaz.
6. Aynı operation/store/profile/version girdisi aynı key'i üretir; commit-unknown retry yeni key üretmez.
7. Credential aynı değeri encrypted provider envelope içinde taşır. Public key-file publication yalnız exact path üzerinden kontrollü declassification'dır.
8. Legacy `apps/admin/lib/indexing-service.ts`, `apps/admin/app/api/seo/indexnow/route.ts` ve storefront donor IndexNow kodu import edilmez veya değiştirilmez.
9. Production registry, production environment ve production deployment bu teslimatla otomatik etkinleşmez.

## 4. Değerlendirilen yaklaşımlar

### 4.1 Seçilen: mağaza başına platform-managed key

Celebix key'i üretir, profile credential olarak şifreler ve exact storefront host üzerinde yayınlar. Rotation, revocation, tenant binding ve idempotency merkezi authority tarafından yönetilir.

**Avantajlar:** kullanıcı kurulumu yok; wrong-store riski atomik SQL ile kapanır; rotation tek yüzeyden yönetilir; shared storefront yapısına uyar.

**Maliyet:** profile lifecycle ile public key publication arasında yeni dar bir PostgreSQL sözleşmesi gerekir.

### 4.2 Reddedilen: merchant-managed key file

Kullanıcının kendi key ve key file URL'sini girmesi daha az server kodu gerektirir; ancak key sahipliği, dosya erişilebilirliği ve rotation sorumluluğunu kullanıcıya bırakır. Onaylanan platform-managed hedefle uyumlu değildir.

### 4.3 Reddedilen: bütün mağazalar için tek platform key'i

Uygulaması kolaydır fakat bir sızıntı veya rotation bütün tenant'ları etkiler. Per-store audit ve revocation sınırını bozar.

## 5. Authority modeli

### 5.1 Merchant authority

Panel işlemleri yalnız mevcut server-side panel session ve `TenantContext` üzerinden çalışır. Yetki için browser `storeId`, hostname, provider code, key, plan veya profile version kabul edilmez.

IndexNow provisioning yalnız:

- aktif store;
- aktif membership;
- `integrations.manage` aksiyonuna izin verilen rol;
- aktif ve geçerli plan;
- etkin `integrations` feature;
- store'a ait exact active canonical storefront domain

birlikte doğrulandığında çalışır.

### 5.2 Storefront authority

Key-file route önce mevcut trusted reverse-proxy host selector'ını, ardından PostgreSQL exact-host resolver'ını kullanır. `Host`, `Forwarded` ve `X-Forwarded-*` header'ları yalnız mevcut trusted proxy sözleşmesi tarafından seçilmiş authority üzerinden değerlendirilebilir; route kendi başına bunlara güvenmez.

Public lookup şu exact tuple ile yapılır:

```text
(canonical_hostname, verification_path, request_time)
```

Store inactive, domain inactive/unverified, non-canonical alias, profile revoked/disabled, credential version stale veya path mismatch ise key dönmez.

### 5.3 Worker authority

Worker yalnız `celebix_saas_workflow` rolünün SECURITY DEFINER fonksiyonlarıyla claim/finalize/reconcile yapar. Doğrudan provider/profile/job/publication table DML yetkisi verilmez.

## 6. Credential ve key publication yaşam döngüsü

### 6.1 Server-generated key

Customer-panel runtime yeni bir immutable `IndexNowKeyDerivationAuthority` alır:

```ts
interface IndexNowKeyDerivationAuthority {
  readonly activeKeyId: string;
  derive(input: Readonly<{
    storeId: string;
    profileId: string;
    credentialVersion: number;
    operationId: string;
  }>): Uint8Array;
}
```

Uygulama HMAC-SHA-256 domain separation kullanır:

```text
celebix:indexnow:v1\0storeId\0profileId\0credentialVersion\0operationId
```

Sonuç lowercase hex olarak 64 karakterdir. Derivation inputları exact UUID/version parser'larından geçer. Root key environment snapshot'ından bir kez parse edilir; browser bundle, logs, errors, RSC veya public config'e geçmez.

### 6.2 Dedicated provisioning endpoint

Generic provider profile endpoint merchant-supplied credential içindir ve IndexNow key üretmez. P1 şu dar endpoint'i ekler:

```text
POST /api/merchant-providers/indexnow/activate
```

İstek yalnız `expectedVersion` ve varsa existing `profileId` taşır. Exact Origin, panel session, role, feature ve idempotency kontrolleri mevcut provider HTTP authority ile aynıdır. Provider code, capability, hostname, key location ve credential server tarafından seçilir.

### 6.3 Atomic persistence

Yeni PostgreSQL migration bir `merchant_indexnow_publications` tablosu ve tek provisioning function ekler. Function aynı transaction'da:

- tenant/plan/membership authority'yi yeniden doğrular;
- store'un exact active canonical storefront domain'ini seçer;
- provider definition'ın `indexnow/indexing` olarak enabled olduğunu doğrular;
- encrypted profile credential/version'ı kaydeder veya rotate eder;
- derived verification value ile exact `https://<canonical-host>/<value>.txt` location'ı publication satırına bağlar;
- eski publication version'ını `retired` yapar;
- immutable operation result kaydını yazar.

Publication tablosunda direct table privilege hiç kimseye verilmez. Raw verification value generic profile/list/audit projection'larına girmez. Değer yalnız exact public lookup function'ından exact path eşleşmesiyle dönebilir.

### 6.4 Lifecycle

- `pending_validation`: yeni key file yayınlanır; job queue kapalıdır.
- `active`: key file yayınlanır; job queue açıktır.
- `disabled`: key file ve yeni job queue kapanır.
- `rotation_required`: key file kapanır; yeni credential zorunludur.
- `revoked`: key file kalıcı kapanır; eski path yeniden açılamaz.
- rotation: credential version ve publication version birlikte artar; eski exact path aynı transaction'da kapanır.

IndexNow adapter profile validation sırasında public key location'ı fixed-timeout GET ile okur ve body'nin exact credential value olduğuna bakar. Redirect, non-200, wrong media type, oversized body, invalid UTF-8 veya content mismatch profile'ı active yapmaz.

## 7. Immutable indexing payload

Mevcut P0 worker claim yalnız `recordId` taşır; gerçek adapter için bu yeterli değildir. Migration, provider job'a aşağıdaki server-produced snapshot'ı ekler:

```ts
type IndexNowExecutionPayload = Readonly<{
  schemaVersion: 1;
  canonicalHostname: string;
  keyLocation: string;
  urls: readonly string[];
  recordVersion: number;
  publicationVersion: number;
}>;
```

Queue function source `merchant_admin_records` satırını, active canonical domain'i, active IndexNow profile'ı ve current publication'ı aynı transaction'da lock/validate eder. Snapshot digest job'a bağlanır ve claim bu payload'ı exact parser üzerinden worker'a verir.

URL kuralları:

- array uzunluğu `1..100`;
- toplam encoded payload `<= 32 KiB`;
- her URL `1..2048` karakter;
- exact trimmed ve control-character içermeyen değer;
- canonical `https:`;
- username/password, explicit port ve fragment yok;
- hostname exact `canonicalHostname`;
- duplicate yok;
- input string `new URL(value).href` ile exact eşleşir; parse/serialize alternatifi kabul edilmez;
- sıra korunur ve adapter aynı sırayı gönderir.

`reason` merchant kaydında audit amacıyla kalır ancak dış payload'a girmez.

Record queue sonrasında değişirse leased job eski immutable snapshot'ı kullanır. Yeni record version için yeni job gerekir. Profile credential/publication rotation, henüz claim edilmemiş stale job'ın claim edilmesini engeller.

## 8. IndexNow adapter

Adapter `MerchantProviderAdapter` sözleşmesini kullanır:

```ts
providerCode: "indexnow"
capability: "indexing"
```

### 8.1 HTTP policy

- exact endpoint: `https://api.indexnow.org/indexnow`;
- method: `POST`;
- redirect: `manual`;
- `Content-Type: application/json; charset=utf-8`;
- `Accept: application/json, text/plain;q=0.1` yalnız response müzakeresi için;
- fixed connect/overall timeout;
- bounded response headers ve en fazla 4096-byte body drain;
- fatal UTF-8 decode;
- endpoint user/profile/public config ile değiştirilemez;
- logs request body, key, keyLocation, URL query, credential veya raw response taşımaz.

Body exact olarak:

```json
{
  "host": "store.example",
  "key": "<credential>",
  "keyLocation": "https://store.example/<credential>.txt",
  "urlList": ["https://store.example/..." ]
}
```

### 8.2 Response mapping

| Sonuç | Durable sınıflandırma |
|---|---|
| `200` | `succeeded / accepted` |
| `202` | `succeeded / accepted`, safe reference pending-verification sınıfını taşır |
| `400`, `403`, `422` | `permanently_failed` ve sabit secret-free code |
| `429` | `retryable_failed / provider_rate_limited` |
| `500..599` | `retryable_failed / provider_unavailable` |
| Redirect, malformed status/body policy | `permanently_failed / provider_response_invalid` |
| Send başladıktan sonra timeout/socket reset | `provider_outcome_unknown / transport_outcome_unknown` |
| Request yazılmadan önce kesin local validation/config failure | permanent veya retryable exact local code |

Safe provider reference URL, key veya provider response içermez. Şu biçimde server-produced digest kullanır:

```text
indexnow:<http-status>:<first-24-hex-of-payload-digest>
```

## 9. Unknown outcome ve reconciliation

IndexNow sonucu sorgulayacak bir status endpoint sunmaz. Bu nedenle:

1. `provider_outcome_unknown` otomatik olarak yeniden POST edilmez.
2. Aynı job normal claim kuyruğuna geri dönmez.
3. UI `Sonuç doğrulanamıyor — otomatik tekrar gönderilmedi` gösterir.
4. Store owner açıkça `Yeniden doğrula ve gönder` seçtiğinde yeni idempotent reconciliation operation oluşur.
5. Reconciliation önce current profile/publication/domain authority'yi salt-okunur doğrular.
6. Snapshot authority değişmişse eski payload gönderilmez; yeni indexing request/job gerekir.
7. Authority aynıysa aynı ordered immutable payload en fazla bir kez yeniden gönderilir.
8. Reconciliation POST'u da ambiguous kalırsa tekrar `provider_outcome_unknown` olur ve otomatik döngü oluşmaz.

P0 worker bu akış için reconciliation claim'i ve adapter `reconcile` sonucunu gerçek anlamda kullanacak şekilde daraltılmış biçimde genişletilir. Başka provider capability'leri registry'de olmadığı için davranışları değişmez.

## 10. Panel deneyimi

`/seo/fast-indexing` aşağıdaki gerçek durumları gösterir:

- bağlantı yok: `IndexNow bağlantısını etkinleştir`;
- pending validation: `Anahtar dosyası doğrulanıyor`;
- active: canonical hostname ve maskeli `…<last-6>` reference;
- queued: `İş sırada`;
- leased: `Arama motoruna iletiliyor`;
- unknown: `Sonuç doğrulanıyor — otomatik tekrar gönderilmedi`;
- succeeded: `IndexNow isteği kabul edildi` ve safe timestamp/reference;
- failed: sabit hata açıklaması ve izin verilen sonraki eylem.

UI raw key, key filename, full keyLocation, credential version secret material veya full submitted URL query göstermeyecek. Merchant yalnız kayıt URL listesi ve gerekçeyi yönetir.

## 11. Güvenlik ve failure behavior

- Default registry ve route activation `disabled` kalır.
- IndexNow adapter yalnız explicit approved staging runtime registry'sine eklenir.
- Key derivation/config parse hatası runtime'ı fail-closed yapar.
- DNS veya redirect ile alternatif provider endpoint'e gidilmez; endpoint compile-time constant'tır.
- Key-file lookup alias domain üzerinden key döndürmez.
- Direct table DML, cross-store function call, forged profile/publication version, wrong membership ve inactive plan reddedilir.
- Credential plaintext buffer her validate/execute/reconcile sonrasında zero edilir.
- Commit-unknown profile provisioning ve job finalize mevcut recovery/idempotency semantiğini korur.
- Error/audit kayıtları yalnız operation class, provider code, capability, HTTP classification ve safe request ID taşır.
- `apps/admin/**`, legacy storefront donor uygulamaları ve production config değişmez.

## 12. Test stratejisi

### 12.1 Unit ve contract

- deterministic key derivation ve domain separation;
- wrong key length/type/prototype/extra-key negatifleri;
- exact URL, payload, response-code ve safe-reference parser testleri;
- redirect, timeout-before-write, timeout-after-write, malformed content type/body ve oversized response;
- credential buffer zeroing;
- generic profile endpoint'in server-managed IndexNow credential kabul etmemesi.

### 12.2 PostgreSQL 16 disposable harness

- migration apply/rollback/reapply ve manifest checksums;
- per-store publication isolation;
- exact canonical domain ve active profile binding;
- concurrent provisioning/rotation/queue/claim/reconciliation;
- stale profile/publication/record/plan version denial;
- direct DML ve RLS denial;
- immutable operation replay/mismatch;
- backup/restore;
- cleanup verification;
- raw verification value'nin generic profile/job/audit projections'ında bulunmaması.

### 12.3 Storefront

- exact canonical host + exact key path `200 text/plain`;
- wrong key, old key, alias host, inactive store/domain/profile, query, fragment, child path ve non-GET denial;
- security headers, no redirect ve `no-store`;
- normal storefront/product/cart/checkout behavior regression.

### 12.4 Panel ve worker

- missing/wrong Origin, session, role, feature, store ve operation ID;
- active profile olmadan queue denial;
- exact persisted URL snapshot ve ordered transmission;
- unknown durumda provider call count `1`;
- explicit reconciliation'da en fazla bir yeni call;
- wrong/stale authority'de provider call count `0`;
- loaded/empty/error/unknown/permission responsive UI;
- DOM/RSC/network/console secret scans.

### 12.5 Tam regresyon

- SaaS contracts tests/typecheck;
- SaaS data tests/typecheck;
- Owner tests/typecheck/build;
- customer-panel tests/typecheck/build;
- storefront-shared tests/typecheck/build;
- provider foundation PostgreSQL harness;
- `git diff --check`;
- tracked-diff secret/forbidden-ID scan;
- `apps/admin/**` ve donor storefront diff count `0`.

## 13. Rollout kapıları

1. **Design:** bu doküman ve implementation planı.
2. **Code complete:** adapter, migration, route, UI ve bütün local/disposable PostgreSQL kanıtları; dış ağ çağrısı `0`.
3. **Isolated staging:** ayrı yazılı onay, staging-only derivation/encryption keys, disposable IndexNow submission ve key-file crawl kanıtı.
4. **Production readiness:** secret rotation/revocation, telemetry/alerting, rollback rehearsal ve exact production config review.
5. **Production activation:** ayrı yazılı onay; bu tasarım bunu yetkilendirmez.

## 14. Başarı tanımı

P1 ancak aşağıdaki koşullar birlikte tamamlandığında kapanır:

- active canonical storefront üzerinde doğru key file doğrulanmıştır;
- immutable URL snapshot tek adapter call ile IndexNow tarafından `200` veya `202` kabul edilmiştir;
- durable job state ve panel projection aynı sonucu gösterir;
- wrong-store, wrong-host, stale-key, replay, concurrent claim ve unknown outcome testleri geçer;
- credential/key normal API, logs, DOM, RSC veya audit projection'larına sızmaz;
- disposable PostgreSQL backup/restore/rollback/reapply ve cleanup geçer;
- ayrıca yetkilendirilmiş staging credential/publication revoke edilmiştir;
- production connection, mutation, deploy ve merge sayıları `0` kalmıştır.
