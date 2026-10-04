# Hakkımızda, İletişim, Blog — required store pages

## Scope

Modern shared SaaS registration creates three ordinary, editable content pages in
the same database transaction as the tenant's store. They start as blank drafts.
The page list pins the three identities before custom pages, with a small
`Zorunlu` badge. Required editors keep rich content, name, publication and SEO
editing while hiding their server-owned address and locale. Required pages
cannot be archived, deleted, reassigned, or have their captured route changed.

SQL 213 also fills missing pages for existing stores. An unambiguous usable
existing page is adopted without modifying its record, body, versions or
publication state. Ambiguous or temporary UUID routes stay untouched; a new
draft uses an available canonical slug. The shared content locale configuration
is authoritative, including its `tr` fallback.

Blog has an editable landing title, introduction and SEO. Its existing post
list and pagination continue at `/blog`; a published mapped page alias redirects
there. Navigation, design destinations, SEO and sitemap paths use the same
server-owned mapping.

## Verification

- Full shared contract suite: **549/549 passed**. Required identity is optional
  response metadata; write requests cannot claim it.
- Merchant admin/content repositories: **32/32 passed**, including transaction
  local read-shape negotiation and lost-commit recovery.
- Content editor behavior: **19/19 passed**.
- Merchant module presentation: **14/14 passed**, including legacy active pages
  with an unpublished flag appearing consistently as drafts in list/editor.
- Isolated browser fixture: **7/7 passed** through production API clients.
- Customer panel, owner and shared storefront production builds passed. Owner build ran without
  legacy Supabase auth environment settings; this does not verify live auth.
- Final customer panel, shared storefront and data package type checks passed.
- Public repository/helper/real route integration scope: **42/42 passed**.
- Full shared storefront tests: **980/980 passed** (823 server + 157 browser
  unit tests). This includes the narrowly repaired pre-existing missing
  `RestockAlerts` mock in the SEO integration test harness.
- Full data package suite: 847 passed, 2 skipped, 1 subprocess timeout while
  builds ran concurrently. That unchanged hosted-checkout case passed when run
  alone; the full suite is not reported as entirely passing.
- Native PostgreSQL verification: **26/26 scenarios passed** in a disposable
  local database. This covers registration atomicity/rollback, safe adoption and
  ambiguous legacy records, CAS/replay/recovery, initial version history, route
  and locale locks, tenant/role isolation, canonical public paths, disabled
  locales, and retention of required pages in the bounded 200-item projection.
  An active support session can save pages while retaining its write audit and row journal; an unredeemed, wrong-host or revoked session cannot write. The original fixture preserved **1589 unrelated functions**; the final SQL214 fixture preserved **1590**. The 19 changed functions
  retain their owner, grants, arguments, defaults and authority attributes.

Native verification command:

```sh
REQUIRED_PAGES_NATIVE_POSTGRES=1 node --test apps/owner/scripts/sql/saas/required-store-pages-migration.test.mjs
```

## Browser evidence

The memory-only fixture uses the production list, editor and API clients. No
live database, session or customer content was modified. Chrome CUA verified:

- 1440, 1024 and 390 px list/editor layouts without document horizontal overflow.
- Required records have no archive action; the custom page retains one.
- Blank body editing, publish selection, save, list return, reopen, and v1/v2
  history display. Required address/locale controls are absent.
- Failed saves retain body text. Read-only has no save action, a read-only name,
  and `contenteditable=false`.
- Dirty navigation opens the existing confirmation; cancelling keeps the draft.
- Keyboard Tab moves from name to publication with a visible focus outline.
- Loading and retryable read failure display explicit states.

Screenshots are in [evidence/required-pages](evidence/required-pages).

Chrome emitted hydration warnings for browser-injected body attributes named
`__processed_<uuid>`. The warning diff contained no application attribute
mismatch. It is recorded here rather than claiming a clean browser console.

## Live rollout — 2026-10-04

The authorized rollout completed at application source
`7d864534c4f3d71f6a20717135aa20ded2a03f15` on
`codex/required-store-pages-release`. All four normal deployments finished in
the order below; the independent final runtime/image/source/compiled-feature
and payment-authority checks passed at **02:18:21 UTC**. The release helper
also verified the four prepared configurations and an idle deployment queue.

| Application | Finished deployment |
| --- | --- |
| Shared storefront NET | `nfcu50cx6knftqxpjz709ej8` |
| Shared storefront SITE | `hjgwoac4rudtxwett99g9nd0` |
| Shared customer panel NET | `b131xotbhqve7e8wualens0p` |
| Shared customer panel SITE | `mnr5g3bfao6lw7pjcvtr2kv5` |

SQL213 committed once at **01:45:27 UTC**, followed by a separate read-only
verification at **01:45:29 UTC**. All **12 stores** now have three required
identities: **36 mappings**, **33 new blank drafts** and **3 adopted pages**.
Existing records, bodies and histories were preserved. The live catalog's
**1615 unrelated functions** retained their exact source and authority.

The actual prerequisite order was **212 → 214 → 213**. SQL214 had already
been applied by the preceding release and was not applied again. Disposable
native rehearsals verified both 214/213 orders with identical final function
source and authority. Exact release gates covered **96 functions before /
106 after**, including **52 financial functions**, **20 explicit payment
signatures** and **7 successful startup preflights**.

- SQL213 UP SHA256: `4105d378c65176839ed70c9e8c0b964d85bf138278f779cde8813eb02a2a7d39`.
- Actual SQL214 baseline UP SHA256: `cf4ded329788deab9d95743d3751f9e44759e9d01a24cceebcaf11357f848665`.
- Immutable SQL213 forensic manifest SHA256: `59d58e0c2081593aada089b2cc4d43229316a696a0ec769fd6a8e8e5bd64f219`.

New repositories request metadata using the transaction-local
`saas.required_pages_projection_version=1` setting. Old callers retain their
exact legacy DTO shape; this setting grants no authority.

The shared release retained existing navigation, support, checkout and payment
behavior. Existing payment modes, inactive approvals and all preview rows were
preserved; the normal source pins and reviewed source-bound approval metadata
were updated. Owner application pins and platform-auth configuration were not
changed. No payment provider was invoked and no customer content was saved.

### Live browser and public acceptance

Butik Siora's real authenticated panel showed Hakkımızda, İletişim and Blog
first, each marked `Zorunlu` and `Taslak`, with no archive action. Hakkımızda
and Blog editors showed editable content, publication and SEO fields, with no
address or locale control. Blog retained its direct link to blog posts. This
smoke check did not change or save customer content. Güzide's own test tab
required sign-in; an authenticated Güzide editor check is not claimed.

Live screenshots are in [evidence/required-pages](evidence/required-pages).

The first strict public receipt retained its **176/222 passing checks and
46 failed assumptions**. Native required-page publication and alias reads
passed **27/27 each**, adopted public identity/body checks passed **7/7**,
draft/disabled sitemap exclusion passed **20/20**, and legacy-page/body/design
preservation and the final input fence passed. Its failed HTTP assertions
assumed every alias kept its own canonical hostname and every page-level
404/redirect set an HTTP404/308 status before streaming started.

Targeted read-only diagnosis confirmed the existing primary-host redirect
policy, Next's explicit streamed 404/noindex boundary without content, and
the published Blog alias's exact permanent redirect signal. These framework
and host-routing sources were unchanged by this feature. A separate qualified
supplement records the final HTTP evidence; the first failed receipt is not
rewritten or presented as a full pass.

Three domain records changed version by one after the before snapshot at
01:24 UTC. Their current domain and provisioning-worker timestamps agree at
**01:35:43–45 UTC**, before SQL213's apply. Captured hostname, store, type and
primary identity remained unchanged, and all **9 active public hosts** resolved
to the correct store and native primary address. The old full domain rows were
not captured, so full-row byte preservation is **not claimed**; that original
fingerprint failure remains recorded. SQL213 contains no domain DML.

The supplemental automated receipt retained **245/268 passing checks**, including
canonical host hops, all primary published bodies, sitemap output, domain
authority and the final input fence. Its remaining **23 parser assumptions**
were diagnosed separately: 20 exact 404 components were encoded in Next's
Flight stream before hydration; three Blog responses contained two identical,
correct permanent-redirect metadata nodes. These failed receipts remain
immutable; neither automated run is reported as entirely passing.

Root then verified the two affected behavior families in real Chrome: Siora's
draft `/pages/hakkimizda` hydrated into the exact 404 screen with no content;
Güzide's published `/pages/blog` navigated to `/blog` and displayed the existing
Blog index. This gives **qualified functional acceptance**, with the existing
streamed HTTP200 behavior and missing old raw domain rows explicitly retained
as limitations. Browser scope is these two public cases and Siora's admin
list/editors; no additional authenticated Güzide editor or live registration
was manufactured.

- Original strict receipt SHA256: `77b71575993f64d543c29641afc90bf60ec2cfc412d0da0052ad51f5dd884b3b`.
- Supplemental automated receipt SHA256: `41a5e961ffe2b4a04321b5cfeceb9207828661fdbcec1f2765ff6443837d86ed`.
- Stream/metadata diagnosis SHA256: `6ce5993de3eb004c2df79755981c127ba21617dff8680e5c1199b6f50803594a`.

The public probes covered **9 hostnames / 5 stores**, **7 published projections
of 3 adopted records**, **20 hidden draft projections with no saved content**, and one content
sitemap shard. The migration and registration checks cover all 12 seeded stores
and newly registered stores separately from that public-host coverage.

The release branch also preserves the current owner control-plane, invitation, support, checkout and storefront navigation sources. Merged panel/storefront builds passed; 40 panel/fixture tests, 38 focused storefront tests and 7 navigation tests passed. A duplicate pre-existing RestockAlerts test mock and missing platform export whitelist entries were reconciled.

The migration down script refuses populated mappings/seed history instead of
destroying tenant content. Rolling back an app must retain SQL 213.
