# Phase 2 Shared SaaS Threat Model

Status: design-time assessment. Production and staging activation remain **NOT READY**.

## Scope and method

This model covers the Owner control plane, Hemenaku-derived `apps/admin-shared` BFF, shared/private/custom-theme and custom-frontend storefront modes, platform SEO/domain authority, commerce read/write paths, internal tenant bootstrap boundary, shared PostgreSQL, persistent registration/OIDC/session stores, Logto integration, Redis/cache/queues, R2, workers, and observability. Existing dedicated stores and the live Hemenaku Admin are out of scope and must remain isolated and unchanged.

Severity measures worst credible confidentiality, integrity, availability, and tenant-isolation impact:

- **Critical:** systemic tenant isolation bypass, arbitrary privileged bootstrap, reusable production credential compromise, or broad undetected compromise requiring immediate activation block.
- **High:** takeover or material data/security impact for one or more tenants, durable identity/session compromise, or corruption requiring urgent mitigation.
- **Medium:** bounded abuse, availability or metadata exposure with meaningful prerequisites and contained recovery.
- **Low:** limited impact, strong prerequisites, or defense-in-depth issue with no direct authority gain.

Residual risk is the risk expected after the listed Phase 2 control. “Low” never means the control or evidence may be skipped.

## Assets

| Asset | Security objective |
| --- | --- |
| tenant data | confidentiality/integrity scoped to one authoritative store ID |
| credentials and secrets | server-only, least privilege, rotation, no logs/errors |
| identity assertions | exact issuer/audience/signature/nonce; issuer+subject authority |
| session records | opaque, hashed, revocable, bounded, non-replayable after rotation |
| registration attempts | immutable, expiring, one-time, recovery-authorized |
| domains | exact ownership, active status, canonical binding, auditable lifecycle |
| media | store-prefixed access, content validation, no enumeration |
| cache | store/version binding; no authority; bounded staleness |
| jobs | store-bound schema, durable idempotency, safe retries/DLQ |
| audit logs | complete, immutable enough for investigation, redacted and access-controlled |
| subscription/entitlement state | current, server-computed, deny unknown/missing capabilities |
| theme packages/settings/previews | signed, versioned, store-private where required, sandboxed, rollback-safe |
| SEO metadata/sitemaps/redirects | exact store/domain/content binding; no global or cross-tenant poisoning |
| inventory/reservations/orders/payments | atomic quantities and state machines; durable idempotency/replay defense |
| storefront read caches/outbox | versioned store/domain/theme/locale/path binding and bounded staleness |

## Threat actors

- unauthenticated internet attacker;
- malicious tenant owner;
- compromised tenant staff member;
- compromised browser or stolen session;
- malicious custom-domain claimant;
- insider with infrastructure access;
- compromised application container;
- compromised queue worker;
- replay attacker;
- automated abuse/bot operator.
- malicious or compromised theme/package supplier.

## Trust assumptions to verify

1. The CDN/reverse proxy supplies exactly one trusted host value and strips untrusted forwarded authority headers.
2. Runtime roles cannot alter migrations, functions, policies, or role grants.
3. The isolated bootstrap role exists only in the internal Tenant Core pool, has explicit bootstrap table/column grants, and cannot perform DDL, alter roles/policies, reach workflow/session/dedicated data, or connect from a public workload.
4. PostgreSQL transactions and constraints, not process-local locks, arbitrate races.
5. OIDC metadata/JWKS is pinned to the exact issuer and the provider application has only exact callback/logout URLs.
6. All storage/cache/job adapters receive a server-established store ID; no full key/path is accepted from a caller.
7. Observability applies allowlist/redaction before export and the exporter cannot silently drop Critical audit events.

## Abuse-case register

“P1” refers to an existing Phase 1 control; P1 controls are often in-memory/test-only and are not production evidence.

| Severity | Threat | Precondition and attack path | Impact | Existing Phase 1 control | Required Phase 2 control | Detection signal | Residual risk | Evidence required before activation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Critical | Cross-tenant read | attacker controls `storeId`, stale pool context, resolver result, cache key, or RLS predicate and reads another store | broad confidentiality breach | `TenantContext`, active membership checks, exact host binding, namespace helpers | `FORCE RLS`, transaction-local context, adapter-owned keys, exact resolver role, cross-layer isolation tests | RLS denial anomaly, context/store mismatch, cross-tenant sentinel access | Low | tenant-role matrix plus API/Redis/R2/queue/log isolation tests across two stores |
| Critical | Cross-tenant write | malicious owner/staff/worker substitutes another store ID in a mutation/job/path | corruption, deletion, privilege abuse | caller store ID is only a hint; store ID binding tests | SQL mutation conditioned on active membership/store; R2/job prefix binding; no generic service role | affected-row mismatch, RLS denial, foreign store ID in envelope | Low | adversarial writes for every role and subsystem; zero cross-store row/object changes |
| Critical | Bootstrap authority abuse | isolated BYPASSRLS credential/pool is compromised or made reachable from a public workload | arbitrary rows within granted bootstrap tables; tenant creation/corruption | internal route hard-disabled; no production adapter | table/column-constrained BYPASSRLS role only in Tenant Core pool, fixed statements, no DDL/ownership/other schemas, workload/network isolation, short-lived secret, quotas/rate limits | unexpected login/workload/query/table/column, abnormal bootstrap volume, privilege catalog drift | Medium | grant/query inventory, credential-absence proof, compromised bootstrap/public container blast-radius tests, catalog diff and audit proof |
| Critical | RLS bypass | a normal runtime role owns tables/has BYPASSRLS, or the isolated bootstrap role escapes its reviewed grants/pool | systemic isolation failure | proposal uses `ENABLE/FORCE RLS`; no global client in shared storefront | forced RLS for normal roles, explicit bootstrap table/column grants, immutable grant checks, pool/credential separation, narrow resolver function scope | role/policy/grant drift alert, cross-tenant canary query, unexpected bootstrap statement | Low | automated catalog assertions, negative direct SQL for normal roles, and bootstrap blast-radius proof |
| Critical | Hostname takeover | claimant races/forges domain proof or stale cache keeps a released domain active | storefront impersonation, credential/payment phishing | exact active-host resolution; pending/disabled fail closed | repeated proof, claim uniqueness, entitlement/quota, release cooldown, TLS readiness, transactional invalidation | domain claim conflict, proof change, known-host mapping change | Medium | domain claim/release/reclaim races and external-proof staging exercise with synthetic domains |
| Critical | Alias redirect poisoning | alias points to attacker canonical domain or update race produces cross-store redirect | traffic/credential diversion | runtime performs second exact canonical lookup and ID/slug match | transactional alias/canonical constraints, safe resolver output, exact cache eviction | alias/canonical mismatch, redirect denial surge | Low | alias/canonical race, chained alias, cross-store target and stale-cache tests |
| High | Session fixation | attacker supplies/retains chosen session before login or active-store change | account/tenant access | server-generated opaque ID; rotation API | hashed random IDs; atomic rotate/revoke; never accept external ID | create collision, reuse of pre-auth digest, rotation failure | Low | login/store-switch fixation tests and old-cookie denial across replicas |
| High | Session replay | stolen old/current cookie reused after logout, rotation, or revocation | unauthorized panel access | secure cookie and destroy/rotate ports | durable revocation through max lifetime, idle/absolute expiry, optional revoke-all, anomaly detection | revoked digest lookup, concurrent geography/device anomaly | Medium | replay after rotate/logout/revoke/database restart; multi-instance revocation latency |
| High | OIDC state replay | callback state submitted twice or concurrently | identity/login confusion, duplicate tenant/session | one-time in-memory consume and callback-state guard | atomic database consume before exchange; digest retention; no callback recovery by state | replay code, duplicate state digest, callback race | Low | simultaneous callbacks across processes produce one provider exchange and one progression |
| High | PKCE downgrade | provider/client omits S256 or accepts plain/no verifier | authorization-code interception | Phase 1 builds S256 and validates URL parameters | provider application enforces PKCE; adapter allowlists S256 and verifies metadata | auth URL validation error, provider config drift | Low | negative plain/missing challenge and wrong-verifier staging tests |
| High | Issuer/audience confusion | token from another tenant/app/provider is accepted | account takeover/tenant creation | explicit expected issuer/audience/nonce checks | pinned issuer/discovery/JWKS, algorithm allowlist, exact audience/client ID, nonce | issuer/audience/alg mismatch counters | Low | wrong issuer, audience, key, algorithm, `azp`, nonce, expiry fixtures |
| High | Idempotency-key collision | bot guesses/reuses key or bug shares key across payloads | wrong replay or denial of signup | opaque 256-bit keys and canonical fingerprint mismatch | unique key, constant-time fingerprint compare, rate limit, collision alert | any mismatch event; repeated key from principals/IPs | Low | same key/same and different fingerprint concurrent PostgreSQL tests |
| High | Duplicate tenant creation | concurrent same signup/slug bypasses process-local lock or retry creates another tenant | billing/data inconsistency and domain conflict | in-memory global serialization; unique checks; idempotent operation | database unique constraints, atomic claim, one transaction, controlled recovery | duplicate constraint, store count drift, repeated operation | Low | multi-process signup/slug races with exact row-count proof |
| High | Unknown transaction commit state | network loss during COMMIT causes blind retry | duplicate or falsely failed tenant; stuck workflow | safe retryable error only; no real DB proof | discard connection, no blind retry, fresh read-only reconciliation by key/fingerprint, quarantine ambiguous rows | `commit_unknown`, processing-age alert | Medium | fault proxy cuts connection at commit; proof for committed, rolled-back, and unresolved outcomes |
| High | Malicious worker payload | compromised producer/worker changes store, kind, path, or operation | cross-tenant side effects | strict namespace helpers | versioned schema, producer auth, store-bound durable claim, entitlement recheck, allowlisted job kinds | schema/store mismatch, unauthorized kind, DLQ event | Medium | forged payload, duplicate delivery, compromised-worker least-privilege tests |
| High | R2 prefix escape | encoded traversal or caller key reaches another prefix | cross-tenant media read/delete/write | strict `buildStoreObjectKey` rejects traversal/percent/backslash | server-generated keys, exact prefix checks on every operation, scoped signed URLs, no root list | prefix mismatch, rejected signed request | Low | traversal/encoding/polyglot and cross-store list/read/delete/copy suite |
| High | Redis key collision | unsafe segments or environment omission collide tenants | data leak, stale authorization, lock interference | normalized store cache/tag/job builders | adapter-owned versioned env/store prefixes, Redis ACLs, no raw keys/wildcards | embedded store mismatch, key validation errors | Low | malicious IDs, collisions, ACL isolation, no wildcard invalidation tests |
| High | Cache poisoning | attacker injects host/store/entitlement payload or stale alias mapping | wrong tenant or unauthorized features | runtime rechecks host/store ID and slug | signed/validated schema payload, exact key, bounded TTL, outbox invalidation, DB fallback | cache/store mismatch, invalid schema/version, invalidation lag | Medium | poisoned entry, stale version, unavailable invalidation, alias/store suspension tests |
| High | Stale membership access | membership revoked while session/cache/request continues | unauthorized panel write | membership checked when `TenantContext` built | per-request DB revalidation; mutation predicate/lock; short/no auth cache; session revoke event | revoked membership request, affected-row zero | Medium | revocation during read and write at transaction boundaries |
| High | Stale entitlement access | plan expires/downgrades after cache/session/job creation | quota/paid feature bypass | server-computed finite entitlements; unknown denied | current subscription check for writes/jobs, bounded cache, outbox invalidation, quota transaction | denied feature after prior allow, quota mismatch | Medium | entitlement change during request/job and stale-cache tests |
| Critical | Privilege escalation | staff changes role/membership or invokes owner-only endpoint across store | administrative takeover | finite roles, active membership binding | role-specific authorization matrix, conditional updates, owner-change safeguards, audit/re-auth for high risk | role grant/revoke events, denied admin action | Low | every endpoint/job tested for owner/admin/editor/analyst and revoked status |
| High | PII leakage in logs | raw registration/provider/database payload reaches logs/traces | privacy breach and account targeting | safe contract errors; Phase 1 tests avoid passwords/tokens | allowlisted event schemas, centralized redaction, DLP scan, restricted retention/access | DLP match, forbidden field scanner, oversized event | Low | seeded canary secrets/PII absent from logs, traces, metrics, DLQ, errors |
| Critical | Secret leakage in errors | stack/provider/SQL error includes token, verifier, DB URL, cookie, signing secret | broad credential compromise | controlled safe errors and no provider client | structured error mapping, secret scanners, crash redaction, rotation runbook | canary secret match, provider body leakage | Medium | fault injection across every boundary with canary credentials plus rotation rehearsal |
| Medium | Signup denial of service | bot fills pools, locks slugs/keys, calls provider, or creates workflow rows | availability/cost degradation | registration hard-disabled; bounded attempt lifetime | layered IP/device/principal rate limits, queue/pool caps, challenge decision, cheap validation first | rate-limit hits, pool/lock saturation, attempt growth | Medium | load/abuse test proving graceful 429/503 and cleanup recovery |
| High | Mass store creation | automated verified accounts exploit free plan | cost, domain inventory, spam storefronts | max-store concept; creation disabled | verified-principal/day quota, risk scoring/challenge, global kill switch, budget alerts, delayed risky activation | stores/principal/IP/device velocity, cost slope | Medium | quota races, distributed rate-limit test, kill-switch exercise |
| Medium | Slug/domain squatting | bot reserves desirable slugs/domains without genuine use | brand abuse and resource denial | reserved starter slug set; unique slug/domain | reservation policy, protected names, expiry/cooldown, verified identity, dispute/admin process | high-value slug attempts, dormant reservations | Medium | protected/reserved/confusable names and concurrent reservation/release tests |
| High | Compromised application container | attacker reads runtime environment or calls every reachable dependency | secrets and cross-tenant access | ports and hard-disabled routes reduce Phase 1 reach | per-service roles, no bootstrap credential in public containers, network policy, read-only FS, short-lived creds | workload identity anomaly, secret access, unusual DB grants/queries | Medium | credential inventory and blast-radius exercise for Owner/panel/storefront containers |
| High | Insider infrastructure abuse | privileged operator queries database/storage or changes grants/logs | undetected bulk access/corruption | ownership boundaries and no production access in Phase 1 | separation of duties, just-in-time access, immutable audit, approvals, break-glass alerts | privileged login/query/export, audit gap, grant drift | Medium | access-review evidence, break-glass exercise, audit immutability and revocation proof |
| Critical | Theme package supply-chain compromise | catalog/private artifact, dependency, signer, or build pipeline is compromised | arbitrary storefront behavior, credential/data theft, mass compromise | Phase 1 has no production theme loader | immutable digest/signature, reproducible build/SBOM, allowlisted declarative capabilities, sandbox, certification, revocation | digest/signature mismatch, signer anomaly, forbidden capability, same artifact across incidents | Medium | malicious package corpus, signer rotation/revocation, reproducibility/SBOM and sandbox escape tests |
| Critical | Custom theme cross-tenant access | private package or settings/cache key is addressable by another store | proprietary theme/settings or tenant data leakage | store namespace helpers | owner-bound artifact grants, store-theme FK, exact cache namespace, renderer without generic storage/data access | owner/store mismatch, cross-store artifact request, cache payload mismatch | Low | store A/B private-package, settings, assets, preview, and cache isolation suite |
| High | SEO poisoning | tenant/theme injects canonical, robots, structured data, redirect, or hidden link policy | ranking loss, phishing, search abuse | exact host/canonical validation | platform-owned SEO renderer, sanitized metadata/rich text, redirect ledger, theme cannot override | SEO diff anomaly, forbidden host/directive/schema validation error | Medium | hostile theme/content metadata and redirect/structured-data tests |
| Critical | Accidental global noindex | configuration, theme, or fallback emits noindex across published stores | platform-wide organic traffic loss | shared storefront is currently disabled | store-scoped SEO policy, no global fallback, deploy canary crawl, alert on eligible indexed URL collapse | robots/noindex canary failure, sitemap/indexable count drop | Low | multi-store robots/meta crawl before/after deploy and kill-switch exercise |
| Critical | Canonical/domain poisoning | attacker/stale cache binds pages to attacker/wrong-store canonical | deindexing, traffic theft, phishing | exact alias second lookup | exact active canonical authority, same store ID/slug, versioned cache/outbox, 301 ledger | canonical host mismatch, cross-store redirect denial, domain version drift | Low | apex/www/platform switch races, poisoned cache, released-domain tests |
| Critical | Sitemap cross-tenant leakage | unscoped query/cache includes another tenant URL/product | confidential draft/catalog leakage and wrong indexing | no production sitemap adapter | store-scoped paginated source, exact canonical host, schema/store validation, no shared global key | foreign store ID/host in sitemap, count anomaly | Low | two-store large sitemap diff, draft/private exclusion, cache collision tests |
| Critical | Domain takeover | old/new claimant exploits release, proof, alias, TLS, or cache gap | storefront impersonation | exact active host and no default | token proof, repeated DNS observation, TLS gate, cooldown/reclaim, previous-owner redirect purge, audit | proof/account change, reclaim during cooldown, certificate/mapping mismatch | Medium | claim/release/reclaim, token replay, proof loss, TLS/cache race rehearsal |
| High | Cache-key collision | key omits store/domain/theme/locale/path/version or parser normalizes unsafely | cross-tenant/wrong-theme/SEO data | Phase 1 store namespace builders | adapter-owned composite key, embedded context validation, versioned payload, collision property tests | embedded key/payload mismatch, impossible hit, canonical version mismatch | Low | combinatorial two-store/domain/theme/locale/path collision suite |
| High | Cache stampede | hot miss/invalidation causes replicas to flood PostgreSQL | platform outage and checkout degradation | no distributed production cache | single-flight/fencing, SWR, jitter, hot-key protection, origin budgets, circuit/load shedding | miss amplification, origin/pool surge, lock contention | Medium | cold-start/hot-product/mass-invalidation load tests with DB query-count gate |
| Critical | Overselling | concurrent checkout/reservation decrements stock without atomic invariant | financial/customer harm and reconciliation | no real commerce write path | conditional inventory update/lock, reservation ledger/expiry, unique checkout/order refs, reconciliation | negative/overcommitted inventory, reservation/order mismatch | Low | last-unit and multi-SKU races at production concurrency; zero oversell proof |
| Critical | Duplicate orders/payments | retry or unknown commit/provider timeout creates new references/charges | double charge/fulfillment | callback/idempotency principles only | store-bound idempotency/fingerprint, provider idempotency, durable replay result, unknown-commit reconciliation | same cart/customer/provider with multiple active refs, mismatch event | Low | same/different fingerprint, timeout/commit cut, duplicate initiation/callback tests |
| Critical | Webhook replay | signed old/duplicate/out-of-order provider event is accepted repeatedly | duplicate capture/refund/state regression | Phase 1 callback replay patterns | signature/account/store verification, unique provider event claim, allowed monotonic state transitions, timestamp policy | replay/out-of-order/unknown reference event | Low | duplicate/out-of-order/forged webhook and crash-after-commit tests |
| High | Checkout denial-of-service | bot or noisy tenant exhausts inventory locks, pools, payment calls, or rate limits | lost sales across tenants | registration rate-limit design | per-IP/store limits, reserved checkout capacity, short lock/query budgets, bot decision, circuit breaker, bulk shedding | checkout queue/pool/lock saturation, error/latency SLO breach | Medium | Tenant X saturation plus Tenant Y checkout load and recovery test |
| Critical | Noisy-neighbor starvation | one tenant monopolizes DB, Redis, queues, workers, media, analytics, bandwidth | other tenants cannot browse/checkout | namespace and bounded pool concepts | workload classes/reservations, per-tenant concurrency/fair queues/quotas, checkout protection, tenant circuit/read-only modes | resource share and neighbor SLO degradation | Medium | mandatory X/Y mixed workload within explicit degradation limits |
| High | Malicious bulk import/export | crafted/huge file causes injection, resource exhaustion, formula/PII exfiltration, or cross-store mutation | tenant data corruption/leak and shared outage | some donor CSV tools; no shared policy | format/schema/MIME limits, tenant-bound staging, quotas, antivirus/formula neutralization, async low-priority jobs, export auth/audit | rejected rows/bytes, formula/PII/DLP hit, workload quota | Medium | hostile CSV/JSON/image archive, million-row quota, cross-store ID, cancellation/cleanup tests |
| High | Theme preview data leakage | guessable preview URL or shared cache exposes drafts/private theme/content | unpublished business data exposure | Phase 1 has no preview runtime | short server-side preview grant bound to principal/membership/store/version, noindex, private cache, no query token | unauthenticated/cross-principal preview, preview URL in logs/referrer | Low | expiry/replay/cross-store/cache/log/referrer preview tests |

## Production blockers

Any of the following is an unconditional production blocker:

1. Any Critical threat lacks an implemented control, named owner, passing adversarial test, detection/alert, or rehearsed kill switch.
2. Any High threat lacks an accepted residual-risk decision and test evidence.
3. Any runtime role other than the explicitly approved isolated bootstrap role has `BYPASSRLS`; the bootstrap role has ownership, schema mutation, grants outside the reviewed table/column matrix, availability to a public workload, or unexpected queries.
4. A public request path can obtain a general service-role/bootstrap client.
5. Cross-tenant read/write succeeds in PostgreSQL, API, Redis, R2, queue, logs, or metrics.
6. OIDC callback accepts wrong issuer/audience/nonce/signature/PKCE, duplicate state, or non-exact redirect.
7. Revoked/rotated sessions remain usable on any replica.
8. Unknown commit simulation causes an automatic blind bootstrap retry.
9. Unknown/ambiguous/inactive/unverified hosts resolve or aliases cross store ID/slug.
10. Forbidden PII or secrets appear in logs, traces, metrics, errors, audit records, or DLQ.
11. Rollback/restore, backup, alerting, incident ownership, or kill-switch evidence is absent.
12. An uncertified/unsigned theme can render, a theme can override platform SEO/checkout, or a private theme/preview crosses tenants.
13. Any published eligible page lacks technically correct SSR crawlability, canonical/robots/sitemap/structured-data policy, or a deployment emits global noindex.
14. Concurrent commerce tests can oversell, duplicate orders/payments, replay webhooks, or blindly retry unknown commits.
15. Tenant X saturation violates Tenant Y degradation limits or checkout priority/fairness controls.

## Required security evidence package

The security reviewer receives migration/role checksums, catalog privilege dump, RLS matrix, concurrency and unknown-commit logs, OIDC negative-test results, session replay results, exact-host/custom-domain tests, storage/cache/job isolation matrix, redaction scan, dependency audit classification, alert screenshots/test notifications, backup/restore proof, and accepted residual-risk register. Evidence uses synthetic identifiers only and includes commands, timestamps, versions, owners, and immutable artifact hashes.

## Audit and incident handling

Required security events and redaction/correlation rules are defined in `saas-phase2-target-architecture.md`. Critical tenant-isolation, privilege-drift, secret-canary, and hostname-takeover signals page the security and owning workstream on call immediately. Emergency response disables registration/store creation first, then the affected resolver/jobs/OIDC path; preserves database/audit evidence; rotates the least set of affected credentials; and never modifies dedicated stores as part of shared-SaaS containment.
