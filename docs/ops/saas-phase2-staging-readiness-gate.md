# Phase 2 Staging and Production Readiness Gate

## Gate verdict

**NOT READY**

This is a hard PASS/FAIL checklist. A category passes only when every row has current evidence at the exact candidate commit, a named approver, and no unresolved Critical/High finding. “Planned,” “not applicable” without written approval, partial runs, and evidence from another commit are FAIL. This documentation-only task supplies plans, not implementation evidence.

The staging gate authorizes deployment only to an isolated synthetic-data staging topology. Production requires a second Atlas decision after staging PASS; staging PASS is not production approval.

## Evidence rules

- Evidence includes command, UTC timestamp, commit SHA, environment ID, tool/runtime versions, full result, immutable artifact hash, and owner/approver.
- Secrets, database URLs, raw cookies/tokens, PKCE verifiers, and customer PII are never evidence.
- Rollback actions are rehearsed, not merely described.
- Any evidence generated after a code/migration/config change is rerun where affected.
- Gate owners cannot self-approve their own security exception; Integration Lead records the final decision.

## A. Code

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Phase 1 test matrix | Integration Lead | pinned full test log | all 282 Phase 1 tests or current approved superset pass | any failure/skip or count unexplained | stop integration; revert candidate changes |
| Persistent adapter tests | each adapter owner | unit/conformance logs by interface | every Phase 1 port behavior plus persistent failure cases pass | missing path, flaky race, unsafe fallback | disable adapter flag; use no production fallback |
| PostgreSQL concurrency tests | Phase 2A | disposable race logs and row counts | every required race passes repeated multi-process runs | duplicate/partial rows or ambiguous outcome | disable registration/store creation; quarantine operations |
| Typechecks | Integration Lead | workspace/package logs | contracts, data, Tenant Core, Owner, panel, storefront packages pass | any type error or excluded affected package | revert offending integration commit |
| Builds | application owners | clean Owner/panel/shared-storefront build logs | all candidate deployables build reproducibly | failure, warning promoted by policy, or hidden runtime dependency | do not publish candidate artifacts |
| Dependency audit review | Security + Integration Lead | classified audit artifact | every finding owned and disposition approved | unclassified/exploitable unmitigated finding | block deploy; revert dependency change or disable affected surface |

## B. Database

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Disposable forward migration | Phase 2A | checksums, before/after dump, logs | clean apply at pinned version with expected schema only | error, drift, manual SQL, unexpected object | destroy target; fix migration; rerun clean |
| Rollback/forward recovery | Phase 2A + Ops | separate DB diff and runbook | reviewed rollback or forward-repair restores expected compatible state | destructive/unexplained diff or untested step | keep flags off; restore prior disposable snapshot |
| RLS matrix | Security + Phase 2A | roles/grants/policies and negative query results | all normal runtime roles deny cross-store access; `FORCE RLS` verified; isolated bootstrap role tested separately | any unauthorized bypass/owner/grant or bootstrap role reachable outside its boundary | revoke role/flag; rotate credential; rebuild grants |
| Least-privilege roles | Security | catalog diff, statement inventory, and bootstrap-role tests | exact privilege matrix; isolated BYPASSRLS role has only reviewed bootstrap table/column grants, no DDL/ownership/other data, and no public-workload credential | unexpected grant/query, non-bootstrap BYPASSRLS, schema mutation, public-container credential, or role drift | revoke grants; disable callers; rotate creds |
| Backups | Ops | backup job result, checksum, encryption/retention | automated synthetic staging backup succeeds and is monitored | missing/unencrypted/unreadable/unowned backup | block writes; repair backup path |
| Restore rehearsal | Ops + Phase 2A | restore-to-new-target logs and validation | RPO/RTO approved; schema/data/RLS/replay tests pass | restore failure, data mismatch, unknown RPO/RTO | keep staging non-authoritative; repair and rerun |

## C. Identity

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Exact callback | Phase 2C | provider config export + route tests | only `https://panel.celebix.site/auth/callback` equivalent staging URL is accepted | wildcard/additional production redirect or caller redirect | disable OIDC; remove bad redirect through approved provider change |
| Issuer/audience/JWKS | Phase 2C + Security | positive/negative token fixtures, key rotation | signature/alg/issuer/audience/time/subject all enforced | any invalid token accepted or outage bypass | disable OIDC/login; rotate/re-pin configuration |
| State/nonce/PKCE | Phase 2B/2C | concurrent consume and protocol tests | state one-time, nonce exact, PKCE S256 mandatory, verifier encrypted/redacted | replay, downgrade, missing check, verifier leak | disable auth start/callback; expire transactions |
| Logout | Phase 2B/2C | local/provider logout test | local revocation commits before fixed redirect; old session denied | cookie cleared without durable revoke or open redirect | disable login; revoke all affected sessions |
| Secret rotation | Phase 2C + Ops | dual-key/credential rotation rehearsal | rotation completes without accepting old credential beyond overlap | downtime without plan, leaked/unknown secret inventory | disable OIDC; revoke old secret and restore approved version |
| No token leakage | Security/Observability | canary scan of UI, URLs, logs, errors, traces | zero access/refresh/ID tokens or verifiers outside server exchange | any token in browser/log/error/URL | disable OIDC; purge where possible; rotate; incident response |

## D. Sessions

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Secure cookie | Phase 2B | response/header/browser tests | `__Host-`, HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, bounded age | missing attribute, token/query transport | disable login; clear/revoke sessions |
| Persistent revocation | Phase 2B | cross-instance logout/revoke tests | revoked digest denied immediately on every replica through max lifetime | replay succeeds or revocation loss | disable auth; revoke-all; investigate store |
| Rotation | Phase 2B | concurrent login/store-switch tests | one atomic winner; old ID denied; absolute expiry unchanged | fixation, multiple active replacements, extended max age | disable affected action/login; revoke chain |
| Expiry | Phase 2B | idle/absolute/clock-boundary tests | 30-minute idle and 8-hour absolute policy enforced | stale session accepted or premature broad failure | disable auth; correct clocks/policy; revoke sessions |
| Multi-instance behavior | Phase 2B | A-create/B-read/restart/revoke suite | no process-local dependency and consistent denial | state disappears or diverges by instance | keep persistent-session flag off |
| Membership revalidation | Phase 2B | revoke-during-request/write proof | no protected mutation after revocation wins | stale membership authorizes | disable panel writes; revoke sessions; fix query |

## E. Storefront

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Exact hostname resolution | Phase 2D + Security | normalization/adversarial resolver suite | exact active host only; ID/slug/store match | suffix/wildcard/default/ambiguous resolution | disable resolver; shared runtime returns 503 |
| Alias binding | Phase 2D | second-lookup and race tests | alias and self-canonical record bind same active ID+slug | chained/cross-store/stale redirect | disable alias/custom-domain path; purge cache |
| Unknown host failure | Phase 2D | 404/503 and loader-spy tests | no tenant loader/data for unknown/invalid host | default tenant/data leak | disable resolver immediately |
| Custom-domain verification | Phase 2D + Security/Ops | synthetic proof lifecycle | unique claim, repeated proof, active/TLS readiness, release/cooldown | unverified claim activates or stale ownership persists | disable custom domains; mark pending/disabled; purge |
| Cache invalidation | Phase 2D | outbox, TTL, outage, version tests | exact eviction after commit; bounded safe stale window | wrong mapping survives threshold or wildcard purge | bypass cache; bump version; disable resolver if unsafe |

## F. Tenant isolation

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| PostgreSQL | Phase 2A + Security | two-store RLS CRUD matrix | zero cross-store reads/writes for all runtime roles | any row exposed/changed | disable all shared runtime writers/readers; revoke role |
| APIs/BFF | Phase 2B/2D | endpoint authorization matrix | every store hint rebound to current authority; safe denials | forged/stale hint returns foreign data | disable affected routes/flags; revoke sessions |
| Redis/cache | Phase 2D | key/ACL/collision/invalidation tests | exact env/version/store namespace, no raw/wildcard API | collision, cross-store read/delete, stale auth beyond TTL | bypass/flush exact staging namespace; disable cache |
| R2 | Phase 2D | signed URL/prefix/list/delete/copy tests | only exact `stores/{store_id}/...` authorized | enumeration/prefix escape/cross-store operation | disable media; revoke signed URLs/credentials |
| Queue/workers | Phase 2D/2E | malicious payload/duplicate/DLQ tests | store-bound schema and durable idempotency on every side effect | payload substitution or cross-store effect | pause producers/consumers; quarantine queue |
| Logs | Observability + Security | canary and access tests | only safe authoritative IDs, no tenant payload/PII leakage | foreign payload or forbidden fields visible | stop exporter; restrict access; incident response |
| Metrics/traces | Observability + Security | label-cardinality/redaction tests | safe IDs only; no email/host token/cardinality leak | PII/secrets or unbounded tenant labels | drop offending telemetry; disable exporter/instrumentation |

## G. Abuse controls

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Signup rate limiting | Phase 2E + Phase 2B | distributed load/race tests | approved IP/device/principal/global limits and 429 behavior | bypass across replicas or pool/provider exhaustion | disable registration; tighten global limiter |
| Bot defense decision | Product + Security | documented risk/cost decision and test | explicit challenge/no-challenge decision with compensating controls | no owner/decision or automation overwhelms limits | disable signup until decision/control exists |
| Slug reservation | Product + Phase 2B | policy and adversarial names | reserved/protected/confusable/cooldown policy enforced atomically | brand/control names claimable or indefinite orphan reservation | disable store creation; quarantine claims |
| Domain verification | Phase 2D + Security | lifecycle and takeover suite | only verified unique owner activates | proof bypass/replay/reclaim flaw | disable custom domains; invalidate mappings |
| Quota enforcement | Phase 2A/2D | transaction/load tests | max stores, media, staff, products and jobs enforced under race | limit bypass or missing limit treated unlimited | disable affected writes; reconcile overage |

## H. Observability

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Structured audit logs | Observability + Security | schema/event coverage tests | every required event includes applicable safe correlation IDs | missing Critical event, mutable/ambiguous actor/store | block activation; repair instrumentation |
| Trace correlation | Observability | end-to-end synthetic trace | request/operation/store/principal/attempt/job join without secrets | broken chain or untrusted store hint promoted | block affected flow; repair propagation |
| Alerting | Ops/Security + owners | test pages and routing | all proposed Critical/High thresholds notify named on-call and link runbook | silent alert, no owner, noisy unbounded rule | keep flags off; repair/calibrate alert |
| Redaction | Security/Privacy | canary DLP scan | no forbidden token, verifier, DB URL, session/cookie, full payload, excess PII | any match or raw exception export | stop export; purge/contain; rotate/notify as required |
| Health checks | each service owner | dependency failure tests | shallow/deep checks reveal safe readiness without secrets or bypass | false healthy on critical dependency/RLS failure | remove instance from traffic; disable dependent flag |
| SLOs | Product + Ops | approved SLI definitions and dashboards | availability/latency/error/invalidation/revocation objectives owned | absent/untested SLO or no error budget response | staging only; no production activation |

Required audit events are registration started, identity verified, tenant bootstrap started/committed/failed, session created/rotated/revoked, active store changed, domain verification changed, hostname resolution denied, membership denied, RLS authorization denied, idempotency mismatch, worker job failed, theme preview started/denied, theme assigned/published/rolled back/revoked, SEO health failed, canonical domain changed, sitemap generation failed, checkout started, inventory reservation created/released/denied, order created, payment initiated, payment webhook accepted/replayed/denied, refund state changed, outbox delivery failed, tenant circuit-breaker/read-only/checkout-protection state changed, and dedicated escalation recommended. Dashboards and test pages must cover theme publication/revocation, canonical/SEO indexability, checkout success/latency, inventory/order/payment correctness, webhook replay, outbox lag, Tenant X/Y degradation, and protection-mode transitions. Required redaction and correlation fields are defined in the target architecture.

## I. Operational readiness

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Backup | Ops | monitored staging backup | encrypted, retained, checksummed, owned and alerting | missing/unverified backup | disable writes; repair backup |
| Restore | Ops + Phase 2A | restore-to-new-target rehearsal | approved RPO/RTO and full validation pass | restore/data/RLS mismatch | no production; repair and rerun |
| Rollback | Integration Lead + owners | kill-switch/app/schema run | reverse dependency shutdown and compatible binary/forward repair proven | requires unsafe schema down or loses revocation/workflow state | keep candidate off; restore verified target |
| Incident procedure | Security + Ops | tabletop and runbook links | tenant leak, secret, OIDC, domain, DB, cache/job scenarios assigned | missing escalation/evidence-preservation/customer process | do not activate affected subsystem |
| Feature-flag kill switches | Integration Lead | live staging exercise | each flag defaults off, dependencies enforced, disable takes effect within objective | flag bypass, unsafe fallback, config drift | remove traffic/redeploy last disabled config |
| On-call ownership | Engineering lead | schedule/escalation and test notification | every service/database/security alert has primary/secondary | unowned alert or unavailable responder | remain staging-only |

## J. Hemenaku-derived shared admin

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Donor inventory/classification | Phase 2F + Product/Security | file-level module matrix covering every required donor area and assumption | every module classified reusable unchanged / tenant-adapted / configurable / excluded / replace, with rationale and owner | missing module, vague “reuse,” or direct donor coupling undisclosed | stop copying; keep `apps/admin-shared` disabled |
| Hemenaku feature parity | Phase 2F + Product | screen/workflow parity matrix and acceptance recording | launch-required products, variants, categories/collections, brands, inventory, orders, customers, promotions, media, content, settings, shipping/payment config, reports, staff, and themes preserve approved mature capability | mature capability silently lost or incompatible workflow | disable shared admin; continue dedicated Hemenaku admin only |
| Target path and donor isolation | Integration Lead | repository/import/build/deploy evidence | shared derivative exists only at `apps/admin-shared`; `apps/admin`, live Hemenaku DB/env/domain/deploy unchanged; no runtime coupling | donor file/deployment/data/env mutated or imported at runtime | revert derivative change; revoke access/credentials if exposed |
| Phase 1 security foundation integration | Phase 2F + Phase 2B | OIDC/session/TenantContext/membership/store-switch tests | shared admin uses persistent sessions, issuer+subject, active membership/store and request security | separate/minimal auth or donor Supabase profile becomes authority | disable shared admin/login; revoke sessions |
| Tenant-aware admin APIs | Phase 2F + Security | two-store/role matrix for every launch API | authoritative store context and role/entitlement/quota enforced; paginated/bounded; no global client | any browser/env/default store authority or cross-store access | disable affected module/API; tenant read-only mode |

## K. Theme onboarding, publication, and certification

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Theme onboarding | Phase 2G + Product | end-to-end name->slug->industry->catalog->preview->select->branding->identity->tenant flow | exact certified theme version and branding survive workflow/recovery and assign once; frozen contract version gate documented | theme omitted/lost/mutated, unverified package, or tenant created with ambiguous theme | disable onboarding; expire attempt; no tenant creation |
| Anonymous catalog demo | Phase 2G + Security | pre-identity cache/input/crawler and synthetic-data tests | only certified public immutable preview asset/version and fixed synthetic demo data render; no tenant/customer/draft/private/upload/secret input; always noindex | non-public data or package exposed, arbitrary input accepted, cache crosses demo version, or preview becomes indexable | disable anonymous preview; purge exact demo caches; keep onboarding theme selection unavailable |
| Catalog/private/custom model | Phase 2G + Security | visibility/entitlement/artifact tests | public catalog, owner-bound private packages, custom-theme request, and custom frontend handoff are explicit and isolated | private package crosses tenant or custom frontend bypasses shared authority | revoke package/grant; disable mode |
| Draft/preview | Phase 2G | preview/session/cache/crawler tests | draft validates; preview grant is short/store/principal/version-bound, noindex, non-public-cache | guessable/replayable/cross-store/indexable preview | revoke previews; purge preview caches |
| Publish/rollback | Phase 2G | race/fault/outbox/history evidence | one atomic publication winner, immutable prior snapshot, rollback as new publication, exact cache version | partial publish, lost history, commerce mutation, stale public mix | retain/restore last certified snapshot; disable publish |
| Theme certification | Phase 2G + Phase 2H + Security | SSR/SEO/structured-data/mobile/CWV/sandbox report | SSR critical content, canonical/robots, no accidental noindex, valid schema, semantic links/headings, sitemap status, mobile and budgets all PASS | any mandatory certification item fails or arbitrary code/network/data access exists | mark version uncertified/revoked; invalidate caches |

## L. SEO and indexability

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Eligible-page indexability | Phase 2H + Product | synthetic crawler over every content type and storefront mode | every published eligible page returns crawlable SSR critical HTML, 200/approved redirect, self/approved canonical and index policy | client-only critical content, noindex/block, wrong status/canonical | disable storefront/theme publish; restore prior certified render |
| Private/noindex policy | Phase 2H + Security | crawl fixtures for cart/checkout/account/order/admin/preview/draft/search/facets | all required private types excluded/noindex and no sensitive sitemap URL | private URL indexable or uncontrolled facets explode | apply platform noindex for exact type; purge sitemap/cache |
| Sitemap/robots | Phase 2H | tenant-segmented sitemap/robots crawl and two-store diff | exact canonical tenant URLs only, paginated/complete, expected statuses, bounded facets | global/cross-store/draft URL or accidental global disallow/noindex | disable generation; serve last known safe store-scoped snapshot |
| Canonical/redirect ledger | Phase 2H + Phase 2D | domain/slug switch and loop tests | exact active canonical; same-store 301 or 410 policy; no loop/chain/open redirect | canonical poison, wrong store/domain, stale released-domain redirect | disable affected mapping; restore prior ledger/canonical version |
| Structured data | Phase 2H | validator results for Product/Offer/BreadcrumbList/Organization/WebSite/Article/CollectionPage | required types valid and agree with visible authoritative data | invalid/mismatched/cross-store schema or theme override | remove invalid exact projection; block theme publication |
| SEO health alerts | Phase 2H + Observability | canary failure/page test | alerts on global noindex/robots, canonical drift, sitemap status/count, structured-data failure | silent platform-wide indexability regression | disable rollout/theme; restore last safe release |

## M. Custom domains and storefront composition

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Domain claim/proof/TLS lifecycle | Phase 2D + Security/Ops | synthetic apex/www/token/TLS-ready lifecycle | unique pending claim, repeated ownership proof, TLS gate, active/disabled/release/cooldown/reclaim audit | unverified/TLS-unready activation or prior-owner takeover | disable custom mapping; fall back to platform subdomain if safe |
| Platform/custom canonical behavior | Phase 2D/2H | exact-host and HTTP redirect crawl | platform subdomain 301s only to active same-store canonical; apex/www/aliases exact and non-chained | default/suffix/open/cross-store redirect or wrong status | disable alias/canonical switch; purge exact caches |
| Three storefront modes | Phase 2G + Integration Lead | contract suite against catalog/private/custom frontend | identical commerce authority, shared admin, domain, SEO, tenant isolation and common checkout rules | mode forks authority or dedicated frontend implies data fork | disable nonconforming mode; keep approved shared mode |

## N. Storefront performance and high traffic

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Cache-first read path | Phase 2G/2I | CDN/ISR/Redis/PostgreSQL trace and query counts | most steady-state public reads avoid PostgreSQL; composite keys include store/domain/theme/locale/path; targeted invalidation converges | origin/DB per request, collision, unbounded stale/wildcard invalidation | bypass bad layer selectively; disable theme/storefront if unsafe |
| Stampede/hot-product protection | Phase 2I | cold/hot/mass-invalidation load logs | single-flight/fencing/SWR/jitter keep DB/pool within budget | miss amplification saturates origin or checkout | circuit/load shed; serve bounded stale public data |
| Pagination/query budgets | Phase 2I + DB | high-volume catalog/admin/report plans | bounded rows/time/cost and tenant indexes at target scale | unbounded scan, timeout, pool starvation | disable offending query/export; tenant bulk kill switch |
| Core Web Vitals/mobile | Phase 2G/2H | certified mobile lab/field-like report | approved per-template LCP/INP/CLS and asset/JS budgets pass for all themes/modes | budget exceeded or critical content delayed client-only | block theme/release; restore prior certified version |
| Horizontal scaling/autoscaling | Phase 2I + Ops | replica/add/remove and signal tests | stateless replicas, safe cache/session behavior, scale signals/circuit/load shedding meet SLO | process-local authority, unsafe scale event, no overload response | remove candidate; cap traffic; checkout protection mode |
| Replica/search/image decision gates | Architecture + Ops | measured decision records | explicit accept/defer with lag/index/freshness/image security evidence | silent dependency/authority introduction | disable adapter; return to primary/basic search/image path |

## O. Commerce correctness and resilience

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Checkout/order idempotency | Phase 2I + Security | same/different key, timeout, unknown-commit races | one store-bound order/payment reference and immutable replay; mismatch denied; no blind retry | duplicate order/charge or ambiguous success exposed | disable new checkout/payment; reconcile durable/provider refs |
| Stock reservation/oversell | Phase 2I | last-unit/multi-SKU concurrency and expiry/cancel tests | inventory never negative/overcommitted; reservations release correctly | any oversell/leak/stuck reservation beyond policy | disable affected SKU/store checkout; reconcile/release |
| Payment webhook replay | Phase 2I + Security | signed/forged/duplicate/out-of-order/crash tests | one provider event claim, correct account/store/signature and monotonic transition | replay/forgery/duplicate transition/charge | disable provider initiation; continue safe reconciliation callback policy |
| Cancellation/refund/shipping/tax | Phase 2I + Product/Ops | state-machine and reconciliation fixtures | only allowed idempotent audited transitions; required market hooks owned | illegal transition or money/stock/shipping divergence | stop affected transition; manual reconciliation runbook |
| Outbox/notifications | Phase 2I | crash/duplicate/backlog/DLQ evidence | business mutation+outbox atomic; external effects/notifications idempotent outside request | lost/duplicate unsafe side effect or request transaction coupling | pause consumers; replay by durable event after repair |
| Real-customer activation boundary | Atlas + Product/Security/Ops | signed commerce readiness report | all commerce rows PASS for launch market and kill/reconciliation/support runbooks exercised | any missing cart/checkout/inventory/order/payment requirement | no real customer activation; flags remain disabled |

## P. Noisy-neighbor and dedicated escalation

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Tenant degradation limit | Phase 2I + Ops | mandatory Tenant X/Y mixed load comparison | Y checkout success loss <=0.5pp, p95 checkout <=20%, browse p95 <=30%, zero correctness/isolation failure | any threshold exceeded or bulk work wins over checkout | enable checkout protection; stop X bulk work; tenant circuit/read-only mode |
| Queue fairness/worker concurrency | Phase 2I | per-tenant partitions/scheduling and backlog logs | tenant quotas/fair share prevent X starving Y; checkout-class jobs prioritized | Y SLO/backlog miss caused by X | pause X partition; dedicated-worker review |
| Pool/workload priority | Phase 2A/2I | reserved capacity/workload-class tests | checkout retains connections/short queries while reports/imports shed/time out | pool starvation or report blocks checkout | kill bulk queries; checkout protection/read-only mode |
| Storage/media/analytics quotas | Phase 2D/2I | quota/concurrency/bandwidth tests | one tenant cannot exceed approved shared share or reveal another tenant | unbounded resource use/cross-tenant analytics | throttle/disable tenant subsystem; reconcile usage |
| Dedicated escalation runbook | Architecture + Ops | synthetic threshold and decision rehearsal | exact storefront/worker/Redis/queue/DB thresholds produce review only; shared admin compatibility and rollback/data plan documented | automatic migration, vague threshold, or dedicated frontend implies dedicated data | cancel escalation; remain shared under protection; Atlas review |

## Dependency security review

The prior clean installation reported **23 existing npm audit findings**. This number is inherited context, not a fresh audit from this planning task. No `npm audit fix`, dependency install, or package upgrade is authorized here.

Before staging, the Integration Lead and Security owner must produce a machine-readable audit at the candidate lockfile and a reviewed ledger with one row per advisory:

| Required field | Decision rule |
| --- | --- |
| advisory/package/severity/CVE | exact scanner data and link; deduplicate paths without hiding affected versions |
| direct vs transitive ownership | direct dependency owned by its workspace; transitive finding assigned to the nearest direct dependency owner |
| deployed runtime reachability | identify which Owner/panel/storefront/build/test package includes and executes the vulnerable code |
| exploitability | document attacker input, required configuration, runtime path, and compensating control; “dev dependency” alone is insufficient |
| non-breaking fix | prefer tested patch/minor/override only when lockfile owner approves and full matrix passes |
| breaking upgrade risk | isolate API/runtime/schema behavior changes and require a separate implementation/review plan |
| temporary acceptance | named owner, rationale, compensating control, expiry date, tracking issue, and Security approval |
| final disposition | fixed, not affected with proof, or temporarily accepted; unknown/unowned is FAIL |

Staging PASS requires zero unmitigated exploitable Critical/High findings in deployed runtimes, all available non-breaking fixes evaluated, breaking upgrades planned/tested or explicitly risk-accepted, and written Security sign-off. Production requires the same review refreshed at the production candidate commit. The current dependency-audit gate is **FAIL / NOT READY** because no candidate classification artifact exists.

## Feature activation and rollback gate

All defaults remain disabled. Required enable order:

1. Tenant Core PostgreSQL adapter for synthetic internal tests.
2. Persistent registration store.
3. Persistent session store.
4. OIDC login with staging issuer only.
5. Tenant-aware shared admin after the ownership amendment, donor parity, and authorization gates pass.
6. Certified theme platform, including safe anonymous catalog demos and authenticated draft previews.
7. Store creation for direct allowlisted synthetic internal calls, with strict quota and global kill switch.
8. Self-serve registration for allowlisted synthetic principals after store creation passes.
9. Exact-host resolver and published storefront read model for allowlisted synthetic hosts.
10. Platform SEO/indexability core and theme certification.
11. Custom domains for synthetic proof domains.
12. Background jobs by one allowlisted job kind.
13. Commerce writes for synthetic checkout/order/payment flows under checkout protection.

Disable dependent producers first, then consumers, in reverse order. Emergency response always disables self-serve registration and store creation first for onboarding incidents, new checkout/payment initiation first for commerce incidents, and public storefront modes when SEO/canonical authority is unsafe. No persistent adapter may silently fall back to memory. Unknown commits are reconciled before re-enable; session revocation data remains durable; cache/queue state is discarded or quarantined, never promoted to authority.

## Final decision record

| Gate | Current result | Reason |
| --- | --- | --- |
| Staging | **NOT READY** | documents exist, but no adapters, migrations, Hemenaku shared-admin parity, theme/SEO/commerce implementation, rehearsal, provider config, staging deployment, tests, load/crawler evidence, alerts, backup/restore, or approvals exist |
| Production | **NOT READY** | staging has not passed and Atlas has not issued a production authorization |

The Integration Lead must publish a final readiness report listing every row as PASS or FAIL with evidence links. Any FAIL keeps the overall result NOT READY.
