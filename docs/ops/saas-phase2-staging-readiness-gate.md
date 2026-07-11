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

Required audit events are registration started, identity verified, tenant bootstrap started/committed/failed, session created/rotated/revoked, active store changed, domain verification changed, hostname resolution denied, membership denied, RLS authorization denied, idempotency mismatch, and worker job failed. Required redaction and correlation fields are defined in the target architecture.

## I. Operational readiness

| Item | Owner | Evidence | PASS criteria | FAIL condition | Rollback action |
| --- | --- | --- | --- | --- | --- |
| Backup | Ops | monitored staging backup | encrypted, retained, checksummed, owned and alerting | missing/unverified backup | disable writes; repair backup |
| Restore | Ops + Phase 2A | restore-to-new-target rehearsal | approved RPO/RTO and full validation pass | restore/data/RLS mismatch | no production; repair and rerun |
| Rollback | Integration Lead + owners | kill-switch/app/schema run | reverse dependency shutdown and compatible binary/forward repair proven | requires unsafe schema down or loses revocation/workflow state | keep candidate off; restore verified target |
| Incident procedure | Security + Ops | tabletop and runbook links | tenant leak, secret, OIDC, domain, DB, cache/job scenarios assigned | missing escalation/evidence-preservation/customer process | do not activate affected subsystem |
| Feature-flag kill switches | Integration Lead | live staging exercise | each flag defaults off, dependencies enforced, disable takes effect within objective | flag bypass, unsafe fallback, config drift | remove traffic/redeploy last disabled config |
| On-call ownership | Engineering lead | schedule/escalation and test notification | every service/database/security alert has primary/secondary | unowned alert or unavailable responder | remain staging-only |

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
5. Store creation for direct allowlisted synthetic internal calls, with strict quota and global kill switch.
6. Self-serve registration for allowlisted synthetic principals after store creation passes.
7. Exact-host resolver for allowlisted synthetic hosts.
8. Custom domains for synthetic proof domains.
9. Background jobs by one allowlisted job kind.

Disable dependent producers first, then consumers, in reverse order. Emergency response always disables self-serve registration and store creation first. No persistent adapter may silently fall back to memory. Unknown commits are reconciled before re-enable; session revocation data remains durable; cache/queue state is discarded or quarantined, never promoted to authority.

## Final decision record

| Gate | Current result | Reason |
| --- | --- | --- |
| Staging | **NOT READY** | documents exist, but no adapters, migrations, rehearsal, provider config, staging deployment, tests, alerts, backup/restore, or approvals exist |
| Production | **NOT READY** | staging has not passed and Atlas has not issued a production authorization |

The Integration Lead must publish a final readiness report listing every row as PASS or FAIL with evidence links. Any FAIL keeps the overall result NOT READY.
