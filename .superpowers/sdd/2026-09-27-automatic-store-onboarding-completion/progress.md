# SDD ledger — plan: docs/superpowers/plans/2026-09-27-automatic-store-onboarding-completion.md

Execution base: c9225a56aa06d5e8cbb1a0ce741b6735596895fb. Isolated branch: codex/automatic-store-onboarding.

## Preflight

| Tasks | Shared surface or self-agreement | Finding / resolution |
|---|---|---|
| 1 | Injected runner tests vs central login path | Agrees. Live credential/browser gate is separate. |
| 2 | Dedicated claim vs ordinary fenced callback | Agrees; retain marker and unique-key arbitration, no migration. |
| 3 | Scope provenance/jobs/access/worker | Agrees; immutable scope must originate at registration, never scan profile. |
| 4 | Cookie/status/protocol/deadline | Agrees; additive issuer gated until compatible readers deployed. |
| 5 | SQL fee key vs typed mapper/editor | Agrees; preserve existing permitted config. |
| 6 | Truthful aggregate vs permissions/read failures | Agrees; no read-error-to-empty and no provider side effects. |
| 7 | Retry CAS vs fence | Agrees; operator cannot override authority. |
| 8 | Consumer-first release vs rollback | Agrees; proof retained on rollback. |
| 1,3 | Real access routes vs network snapshot | Exact canonical host and tenant health required; no generic200. |
| 1,8 | Proxy/TLS/live gates | Root owns both, token gate does not block source tasks. |
| 2,3 | Completion/store recovery ports | Task2 owns store/completion now; Task3 writes new modules/SQL and defers overlapping integration until handoff. |
| 2,7 | Recovery port/operator retry | Existing dedicated recovery semantics consumed without force-clear. |
| 3,4 | Scope/job/snapshot/runtime | Task3 authority contract shared with Task4 before integration. |
| 3,6 | Access snapshot/context | Store-scoped read only; unknown access shown unavailable. |
| 3,7 | Job CAS/heartbeat | Operations reads restricted aggregate and requeues guarded job. |
| 3,8 | Migration167/worker supervisor | Isolated PG and runtime/package gates before enabling. |
| 4,8 | Migration168/pending transport | Deploy Panel reader before Owner emitter; disable emitter first on rollback. |
| 5,6 | Delivery mapper/page/package runner | Task5 writes delivery + package registration; Task6 adds setup registration afterwards. |
| 5,8 | Shared package + checkout projection | Consumer builds and PG roundtrip required. |
| 6,8 | Live setup acceptance | Use existing Alpler normal login, no re-registration. |
| 7,8 | Runtime audit/ops gates | Root integrates worker audit and confirms safe outputs. |

Ruling: Run independent implementations in parallel with explicit disjoint file ownership — higher-priority proactive delegation and plan permit parallel work; skill generic serial rule conflicts — cost if wrong is integration rework, contained in isolated branch.
Ruling: Extract Turkish Görev headings with a local equivalent to task-brief — bundled extractor only matches English Task — cost if wrong is incomplete brief; checked against full task text.
Ruling: Root may implement Task1 and integration while independent agents work — developer requires useful local progress and root owns infrastructure/release — cost if wrong is reviewable source rework; all code still receives independent review.

## Tasks

| Task | Source acceptance | Remaining release gate |
|---|---|---|
|1|Accepted: central login route, exact probe hostname/role binding;13/13; independent review.|Wildcard TLS token action-time confirmation and live verification pending.|
|2|Accepted: c0863470 dedicated fenced recovery; realPG6/6 and independent review.|Final integrated release.|
|3|Accepted after ecff40f5 corrections: independent14/14, expanded realPG1/1,100.176s; exact3de isolatedNode20 build/runtime import PASS.|Live wildcard TLS, worker activation/heartbeat.|
|4|Accepted:6d47d07d; independent protocol/auth review, controlled fixtures and isolatedPG.|Consumer-first deployment and compatible-emitter activation.|
|5|Accepted fcb09e6a follow-up37/37 independent; actualPG uncertain commit replay1489/365 and finalPanel build PASS.|Actual tenant browser acceptance after TLS.|
|6|Accepted59ad+d8d+e945; independent21Panel+4SF, actual component1440/1024/390 zero overflow, finalPanel build PASS.|Actual tenant browser acceptance after TLS.|
|7|Accepted: f4753a3e; independent review, focused7/7, isolated realPG1/1.|Live super-admin view/worker health.|
|8|Integrated source reviews and3exact3de isolatedQA production builds PASS; combinedPG3/3; live167/168/169 additive up/assertionsPASS08:50:32UTC,10merchanttables preserved. Sixexact3de deployments finished in consumer-first order; globalqueueidle, shared4+Owner2 fullconfigguardsPASS; actualpublic8/8GET/staticformsPASS; correctedactualruntime6/6PASS.|WildcardTLS/activation/liveacceptance and final preservation/cleanup release evidence.|

Source implementation and deployment are authorized. The separate new-token action-time scope confirmation remains pending; no Cloudflare token has been created.

Ruling: Reuse prior audit agent for Task5 after fresh spawn hit harness thread limit — full task brief and disjoint ownership supplied — cost if wrong is context contamination detected by independent review.
QA at fixture preparation: independent task Docker PG16.14 container, loopback SSH tunnel56417; isolated per-task databases restored through166, no source role passwords copied. Live167/168/169 were subsequently applied only by root after fresh private backups/review; existing merchant data and workload role boundaries remain preserved.
Task1 source red3/green12; live token gate pending.

Task4 foundation: root prepared purpose-separated codec/cookie while agents run; codec issue32bytes/os1/canonical digest and24h owner-only cookie tests3/3. Remaining Task4 assigned after slot release.
Ruling: Bundle worker to JavaScript using installed Next webpack/TypeScript — deployed Owner Node20.20.2 cannot execute transform-types — cost if wrong is build/runtime failure caught before flag activation; no Node upgrade or new dependencies.

Ruling: Legacy scope backfill requires matching immutable committed canonical domains and the explicitly verified unique NET/SITE Owner/Panel/suffix mapping — old payload lacks Owner origin; guessing scanenvironment is forbidden — cost if wrong is cross-scope attribution, prevented by exact triple and operation/domain proof guards.
Ruling: Add migration169 for optional shipping days integer1..365 — real PG QA shows old delegated validator90 limit despite source commerce365 contract — cost if wrong is broader validation; narrow delegate preserves all other kinds/keys and independent PG tests/review gate.
Task2 source committedc0863470; source/testsrealPG acceptancepassed, independentreviewpending. Combinedcommit capturedTask2already-stagedfileswithTask4foundation; no historyrewrite. All futurecommitsuse --only exactownedpaths.
Node20 liveimage isolatednetworknone smokePASS forbundledworker --check-runtime, no productioncalls.

Root Task3 follow-up ecff40f5: stale creating uses existing advisory-guarded reconciliation; claims run fresh-clock waves of at most2 within25 total; allSettled waits for both active jobs after a finish failure. Expanded schema-only marker-protected PG16 fixture onboarding_completion_qa_20260928 passed1/1 in100.176s, including12-function167 catalogue, old committed/absent/active completion cases and single operation/store/key/fingerprint. Synthetic realPG plus injected healthyHTTP verification-to-ready12632ms; this is not liveTLS or real email delivery evidence.
Root Task5 follow-up fcb09e6a: full200-record window without an active record cannot prove checkout absence. The editor now shows unknown;199-record absence and a visible active fee remain distinct. RED3/4 then focused UI/behavior26/26; independent follow-up requested.
Payment fixture alignment faaad0f2 changes tests only; focused18/18 and independent review passed. Final Owner suite805/805 PASS. Release source/digest binding changes preserve previous compiled permission flags and every preview/config attribute outside the explicit approved fields. Independent live read-only audit found existing SITE b583 and new3de both fail the exact global DB PayTR authority tuple (false→false); active profiles/methods were not changed and no payment/provider call was made. Compiled flag preservation is not a claim of working provider execution.

Task8 merchant acceptance1a038a5d is test-only: prior real tenant/product/media/design/draft-fee stages plus READONLYpreflight4pass and SAMEgraph continuation4pass; commit/recovery response loss replay keeps onefee/version2, projection1489/365,10merchanttables preserved, externalcalls/orders/providerprofiles0. Wholefreshharness/realOIDC/R2/publiccheckout/TLS not claimed.
Runtime proof preflight found two absent build-only generators in Panel/Owner runtime, also absent in their installed baseline. Frozen nixpacks.toml onlyIncludeFiles excludes them; actual38Panel sourcefiles/image/newroutes/compiledclosedscopes match3de. Verifier packaging qualification is being independently reviewed; missing runtime-required source remains an error.

29 September continuation: local /tmp tools/agent sessions were absent; cause not inferred. Recreated private0700/600 helpers have new hashes and separate peer acceptance, not inherited old107 inputs. New frozen derivation116 runtimeinputs/79 changed inputs; real first run SF27/27+4routes+scopes internallyPASS, but all6 wrapper stops on Panel/Owner selectedmetadata and erroneous globalNode20. Actual selected read proves Panel/Owner4 Nodev20.20.2 +exact3de running image; SF2 Nodev22.23.3 matches frozen Dockerfile.storefront exactnode22 FROM. Narrow helper correction gets new peerreview; app/deployment/env remains unchanged. Firstfailed receipt retained.

New isolated merchant initialREADONLY1completedgraph/zero product-media-fee +one normalSQL089notification; samegraph bounded continuation4pass/0fail/3othermodes skipped. Product/variant/media/designv2/fee1489cents365days and retriesPASS;10registration graph tables+notification preserved; externalfetch/order/payment/profile0. Wholefresh-process receipt unavailable, signup/encryptedidentity replay not retried. New permanent safeinitial/final evidence linked in release doc.

Actual releasedOwnerNET bundle --check-runtime PASS768ms/exit0 in networknone/env-cleared/read-only separate container, noinitializer/tick/HTTP/DB/provider. New proxy fixedsnapshot4files/786862bytes SHA102963e196e5c4d07865d26aba0eff693a2be3517b8fbb7aa60bbed543482d5b; named archive/receipt mode600 and currenthash verified, proxy notinstalled/restarted. Public8GET+staticformsPASS; notbrowser/signed202. ActualAlpler2exactpublic TLS transports bothcertificate_verify_failed/code20, no bypass/cookies/body. CFscopequestion stillpending, nativeChrome unavailable, Owner flagsfalse. Recovery/config backups retained privately; QAgraphs preserved.

Finalcorrectedruntime6/6PASS22:00:04UTC: unchanged inspector757e..., newwrapper8b7b12.../plan4b035... acceptedpeer6/6perkindNode +4/4policydamage; originalfullsixfieldHealthdottemplate missingmapkey wasreproduced andfixedbyindex. ActualPanel2 43/45+8routes/Node20; SF2 27/27+4/Node22; Owner2 72/74+8/Node20 +exactflagstringsfalse. Required sourcebytehashes/SOURCE_COMMIT/imageIDs/generated+compiledscopesPASS; qualified2generators nothashmatches. Receipt8ff745ae... sanitized219104bytes retainedinrepo. Staticmarker proof only; native/signed202/heartbeat pending. Rootpreserved2ownershipreceipts600 +validated4existing reviewedhelpers/specs600 inhostprivate700 folder; no requeue/config/DBchange.

OwnedQA closure: actualexactcontainer exited/exit0/OOMfalse finished22:06:05UTC, AutoRemovefalse, persistentlocalvolume+container retained; noreset/delete/prune. Initialstop runner returnedfalse withouta successreceipt; stop not retried. Subsequentread-only currenttaskidentity/state/volumecheckPASS and records initialuncertainty honestly. Prioractivityaudit0 clients isseparatepointproof. Sourcebuildcontainerabsent. Ownedlocaltunnelsession96869 closed byCtrlC, shellSSHexit255 observed; no liveapp stopped. Worktree/private recovery backups retainedpendingTLS/livegate. Finaldocs/sanitizedevidence committed/pushed inrootcloseout.

## Alpler exact-host remediation continuation

Ruling: Use existing HTTP01 resolver for the two already registered Alpler hosts while the shared wildcard DNS01 gate remains pending — exact Host routes need no new DNS credential or security grant; this is a bounded existing-account repair and does not satisfy future-store wildcard acceptance — cost if wrong is Alpler route interruption, contained by exact rules, fresh private backup and existing-service guards.

Ruling: Preserve the separate authorized analytics release e6a1cc9f rather than restoring3de Panel images — direct parent3de and exactly10analytics UI/test files; no auth/routing/onboarding/package changes. NET Panel strictly pins e6a1 image, NET SF3de, six critical runtime hashes match3de — cost if wrong is consumer incompatibility, constrained by actual guarded preflight and public/native acceptance. No app/env/DB deployment mutation by this remediation.

Author-only helper finaldd81b89d... and .yaml candidate93bc1a22... independently reviewed: author17 inert; peer12runtime models+4filesystem negatives+candidate equality. Root independent6immutable critical source digestsPASS; actualreadonly--inspectPASS. Root public verifier lowercase HTTP header regression observedRED thenGREEN; exact no-store/application-json/wrong-tenant negatives reject.

First--apply stopped at task parent permission preflight (root staging recursively created0755). Root and independent readonly checks prove WORK/before/started/installed/target/tmpABSENT and unchanged dynamic inventory. Root strengthened only taskparent0700. Fresh--inspectPASS and reviewed second attempt performed ONE exclusive atomic installation; first failure retained. Four private0600 fresh backup files and receipts preserved; no apply replay after installation. Same proxy container healthy, compose/default/Caddy bytes unchanged.

ActualAlpler7/7PASS22:43:16UTC: two verified TLS chains/exact SANs89days + persisted expectedUUIDhealth, two301exactHTTPS redirects, two unknownHTTP404, forged SF forwardedHost stillAlplerUUID. Existing8/8public before+afterPASS. Actualbrowser returning login with existing authorized credentials reaches authenticatedAlplerowner; `/setup` access+designready, productformloaded/optionalmeasurements, designpublished, shipping14,89/optional1–365, SFbrand and emptycatalogue allobserved. No new registration or merchant save/publish/payment action. Normallogin may create authsession; not claimed zeroDBchanges acrossbrowserflow.

Finalreadonly preservationPASS: allfour private backup hashes/modes, unchangedhealthyproxy, currenttwoPanels e6a1/fourSF+Owner3de running. OwnerNET/SITE worker/status stringsfalse; no wildcard credential installed. Cloudflare in-app tab atlogin; pending scope question unanswered. NativeAlpler access gate completed; sharedwildcard/activation/heartbeat/recovery/pending202/latency gates remain. See docs/qa/alpler-exact-host-tls-remediation-2026-09-29.md and nine sanitized evidence files. Worktree and all private backups retained.
