# SEO tools implementation and shared interface

Approved user plan: three screens, existing SEO retained, real resource editing, live technical checks, published related links, automatic/manual IndexNow, tenant isolation, staged release.

## Ownership
- Data agent: packages/saas-contracts/src/seo, packages/saas-data/src/seo, their exports, SQL180 and SQL tests.
- Storefront agent: apps/storefront-shared public SEO, metadata, schema, links, robots, sitemap, key route and tests. No runtime repository registration edits until coordinated with root.
- Admin agent: apps/customer-panel UI components, SEO routes, navigation, UI client and tests. No API/server edits.
- Root: panel runtime registration, HTTP/API, IndexNow/check worker and deployment/integration.

## Shared contract (camelCase JSON)
SeoResourceKind = product | category | page | blog
SeoResource: { id, kind, name, path, locale, status, version, seoVersion, title: string|null, description: string|null, canonicalPath: string|null, indexing: inherit|index|noindex, effectiveTitle, effectiveDescription, effectiveCanonicalPath, allowIndex: boolean, imageUrl: string|null, updatedAt }
SeoIssue: { code, severity: error|warning, message, path: string|null, kind: SeoResourceKind|null, resourceId: string|null, fixHref }
SeoSettings: { version, metaTitle: string|null, metaDescription: string|null, allowIndex: boolean, socialTitle: string|null, socialDescription: string|null, socialAssetId: string|null, socialImageUrl: string|null, googleVerification: string|null, bingVerification: string|null, indexNowEnabled: boolean, hostname: string|null, eligible: boolean }
SeoLink: { id, version, sourceKind, sourceId, targetKind, targetId, sourcePath, targetPath, anchorText, enabled }
SeoNotification: { id, path, status: queued|received|verification_pending|retrying|failed, httpStatus: number|null, attempts, requestedAt, nextAttemptAt: string|null, error: string|null }
SeoOverview: { totalResources, publishedResources, issues: SeoIssue[], sitemap: { url: string|null, robotsUrl: string|null, entryCount }, check: { checked, total, status: idle|running|completed|failed, lastCheckedAt: string|null }, notifications: SeoNotification[], settings: SeoSettings }

## Repository and SQL (data agent owns implementation)
PostgresSeoRepository(options: {pool, role: celebix_saas_app, timeouts, audit}) exposes:
- overview({tenantContext,now}) -> SeoOverview
- resources({tenantContext,now,kind?:SeoResourceKind,query?:string,missing?:boolean,cursor?:string,limit?:number}) -> {items:SeoResource[],nextCursor:string|null,total:number}
- saveResource({tenantContext,now,operationId,request:{kind,id,expectedVersion,expectedSeoVersion,title:string|null,description:string|null,canonicalPath:string|null,indexing}}) -> {resource:SeoResource,replayed:boolean}
- settings({tenantContext,now}) -> SeoSettings
- saveSettings({tenantContext,now,operationId,request:{expectedVersion,metaTitle,metaDescription,allowIndex,socialTitle,socialDescription,socialAssetId,googleVerification,bingVerification,indexNowEnabled}}) -> {settings:SeoSettings,replayed:boolean}
- links({tenantContext,now}) -> {items:SeoLink[]}
- saveLink({tenantContext,now,operationId,request:{id:string|null,expectedVersion:number|null,sourceKind,sourceId,targetKind,targetId,anchorText,enabled,remove?:boolean}}) -> {link:SeoLink|null,replayed:boolean}
- notifications({tenantContext,now}) -> {items:SeoNotification[]}
- notify({tenantContext,now,operationId,request:{resources:{kind,id}[]}}) -> {queued:number,replayed:boolean}
- startCheck({tenantContext,now,operationId}) -> {checked:number,total:number,status:string,replayed:boolean}; durable next batch, max25 URLs.

Use SeoRepositoryError codes analogous merchant content: invalid_input, unauthenticated, membership_denied, store_inactive, feature_not_enabled, record_not_found, version_conflict, operation_mismatch, unavailable, commit_unknown.
PublicSeoRepository({pool,role:celebix_saas_host_resolver,timeouts}) exposes get({hostname,now,kind,id})->{resource:SeoResource,links:{anchorText,path}[],settings:SeoSettings}, settings({hostname,now})->SeoSettings, key({hostname,now})->{key:string|null}; failures mapped not_found/unavailable.
SeoWorkerRepository({pool,role:celebix_saas_workflow,timeouts}) exposes claim({now,limit:25,workerId})->{notifications:[{id,storeId,hostname,key,path,attempts,leaseId}],checks:[{id,storeId,hostname,path,kind,resourceId,leaseId}]}; finishNotification({id,leaseId,now,status,httpStatus,error,nextAttemptAt})->void; finishCheck({id,leaseId,now,issues:SeoIssue[],error:string|null})->void.
Worker SQL must deny unverified/temporary/non-primary hosts, leased commits, bounded retries and size limits. Notification triggers include old URL on slug change/delete and enqueue transactionally only if enabled and eligible. Expose authorized candidates once per resource; no legacy draft submission.

## HTTP/UI
GET /api/seo/overview, /resources, /settings, /links, /notifications return repository shapes directly.
PATCH /api/seo/resources/[kind]/[id] body excludes route kind/id; POST /api/seo/settings, /links, /notifications and /checks use request above and Idempotency-Key UUID. Mutations share existing origin/session/capability protections.
resources supports kind, query, missing=1, cursor, limit up to100; first page50.
UI routes /seo?tab=checks|sitemap|links|notifications, /seo/content?kind=product|category|page|blog, /seo/settings. Preserve old deep link redirects and safe dialogs. No duplicated visible titles per AGENTS.md.

## Verification and rollout
Meaningful failing tests before implementation; real PostgreSQL authority/version/idempotency/cross-tenant/rollback tests; public metadata/sitemap/robots/schema/related links/key tests; HTTP authorization and fail/retry behavior; UI tests and browser acceptance desktop/mobile. Ship database/readers before admin, then supervised minute worker. Controlled Guzide change/restore and all shared NET/SITE targets.

## Progress
- Setup: latest deployed merged baseline 7f5b0601, isolated codex/seo-tools. Current fe91691a category commit already ancestor.
- Ruling: use three implementation agents with narrow context and one final review; consolidate test runs to limit credit use while maintaining coverage.

- Initial verification: panel/storefront typechecks and production builds passed; HTTP5, worker6 and supervisor2 meaningful behavior tests green. Public/UI checks cover real metadata and compatibility. Native SQL harness running authority, version, replay and data-retention scenarios.
- Final review found legacy metadata/link migration and short batch lease gaps; reconciliation now preserves native nonempty values and reports conflicts, batches process with concurrency3 and a safe lease.
- IndexNow key location changed to `/<key>.txt` at host root, because official protocol limits nested keys to their directory. Legacy nested route remains compatible.
- Latest independent SITE release c632f554 will be merged before deployment to preserve checkout updates.

- Fresh final verification before source commit: native PostgreSQL17/17; storefront606 server +8 preview tests; focused admin/HTTP/supervisor20/20; contract validation +client compatibility9/9. Panel and storefront typechecks pass. Narrow independent review closed both findings.
- Backup prepared remotely before180, private mode0600,10,466,796 bytes; source specs and snapshots remain private.
- Preserved incoming Güzide checkout release c632f554; source test conflict resolved by retaining the real empty product-row render test, rather than the incoming literal source assertion.
- Live SQL180 applied with71 protected rows unchanged,1,704 native resources; no migration conflicts or fill changes in this deployment.
- Additional SQL181 guards canonical targets that later become noindex. Four native scenarios passed including four target kinds, atomic rejection and public/sitemap fallback. SQL180 source checksum remains frozen.
- Release source b910b1c854f79d3942ce1af975b9ee62411c608d pushed; SQL181 applied with exact checksum. Shared source/payment binding helper preserved all previews, NET LIVE binding and all unrelated configuration.
- storefront_net deployment nrvveu252rq4qgqjiofq1oqf finished; /api/health returns ok. storefront_site deployment om3qxlu0bhd07u3mal05g850 queued next. Private lock, snapshot/spec and receipts at Coolify /tmp/celebix-seo-tools-release-20260930.
- Güzide current allowIndex/indexNowEnabled are false; acceptance must restore these preferences after temporary tests.

- All four b910b1c8 deployments finished and shared release guard verified global idle. Both storefront worker runtime gates passed; NET/SITE health returned ok.
- Live Güzide acceptance: product YZK-518 Cancel preserves fields; Apply updates real HTML title, then original title/description/canonical restored. Robots/schema verified against persisted product price/currency.
- Settings enabled temporarily for protocol acceptance then restored allowIndex=false/indexNowEnabled=false. Robots again Disallow:/; manual IndexNow returned202 verification_pending, not an indexing claim.
- Live category CETAŞ title reached HTML; clear attempt timed out under scan load. Root/data canceled only acceptance run1490f12b-488e-4bf8-bd91-431e2bcfc1b3 (544 processed,696 canceled) to relieve load. Semantic category rollback remains required.
- Final acceptance found old content-sitemap path validator and transient polling stall. Source5e14e03e fixes both plus exact approved menu labels. Focused UI35/35 and repository/sitemap19/19 pass; panel typecheck passed.
- At390px modal/buttons remain inside viewport; failed save retains entered fields. Reverted temporary viewport.
- SQL182 scoped resource projections/materialized overview in progress to address real1672-resource5s timeouts before follow-up release.

## Final acceptance follow-up
- SQL182 applied atomically with the reviewed checksum and private database backup. Scoped native gate6/6 and canonical gate4/4 passed; independent authority/rollback review clear. At1,700 products, individual reads no longer project unrelated products; overview/check start project the catalog once and remain under5s.
- All four shared NET/SITE storefront and panel deployments completed at9fd609fb; release guard verified source/payment bindings, unchanged previews and NET LIVE settings, and globally idle queue.
- CETAŞ category SEO fields restored to original empty values; live title again `CETAŞ | Güzide Kuyumcu`. Product YZK-518 original fields also confirmed restored. Category both-fields-empty behavior passed native tests.
- Sitemap acceptance with indexing temporarily enabled: content shard200 with52 URLs including home/catalog/category, product shard200 with1,000 URLs; persisted lastmod timestamps. Original allowIndex=false/indexNowEnabled=false restored; robots again Disallow:/.
- Güzide has no native page/blog records. Four content kinds are exercised in native data/render tests; live controlled edits use the existing product/category, with no fabricated merchant content.
- Scan87ec29e5-3b7d-49e1-b3d2-76b1b1219f95 checked1,240/1,240 URLs:1,232 without transport errors and8 transport_unavailable results. These failures must stay visible; bounded transport errors do not imply all HTML tests passed.
- Follow-up UI adds safe affected-page links and explains the200-result cap;2/2 focused rendered behavior tests passed. Search Console is linked from the sitemap tab. NET-only intermediate a4c90dc8 rollout will be superseded by the final combined two-panel release.
- SQL183 prioritizes global/indexing/canonical/link/live issues ahead of metadata warnings. Narrow review also required orphan links to remain visible and removable/disableable through the existing authenticated version/idempotency checks.
- Final SQL183 focused native2/2 passed:1,700-product overview2,972ms,200cap retains important issues, orphan source/target visible, disable/remove and idempotent retry work, stale/foreign writes and unsafe create/enable reject. Down restores all3 SQL182 definitions byte-for-byte; frozen180/181/182 unchanged. Independent final review clear.
- Final UI2/2 and panel typecheck passed. An accidental local pnpm invocation moved type dependencies; original dependencies were restored before the successful typecheck, generated pnpm lock removed, no tracked dependency changes.
