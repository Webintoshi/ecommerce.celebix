# Hakkımızda, İletişim, Blog — required store pages

## Scope

Modern shared SaaS registration creates three ordinary, editable content pages in
the same database transaction as the tenant's store. They start as blank drafts.
The page list pins the three identities before custom pages, with a small
`Zorunlu` badge. Required editors keep rich content, name, publication and SEO
editing while hiding their server-owned address and locale. Required pages
cannot be archived, deleted, reassigned, or have their captured route changed.

SQL 209 also fills missing pages for existing stores. An unambiguous usable
existing page is adopted without modifying its record, body, versions or
publication state. Ambiguous or temporary UUID routes stay untouched; a new
draft uses an available canonical slug. The shared content locale configuration
is authoritative, including its `tr` fallback.

Blog has an editable landing title, introduction and SEO. Its existing post
list and pagination continue at `/blog`; a published mapped page alias redirects
there. Navigation, design destinations, SEO and sitemap paths use the same
server-owned mapping.

## Verification

- Full shared contract suite: **548/548 passed**. Required identity is optional
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
- Native PostgreSQL verification: **25/25 scenarios passed** in a disposable
  local database. This covers registration atomicity/rollback, safe adoption and
  ambiguous legacy records, CAS/replay/recovery, initial version history, route
  and locale locks, tenant/role isolation, canonical public paths, disabled
  locales, and retention of required pages in the bounded 200-item projection.
  All **1554 unrelated functions** remain byte-exact; the 19 changed functions
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

## Rollout status and order

Implementation and local verification only; **not deployed**. Existing live
data has not been backfilled. On a separately authorized release:

1. Review the owner-only read-only seed plan in
   `apps/owner/scripts/sql/saas/202610040209_required_store_pages_preflight.sql`
   and source-drift preconditions.
2. Apply SQL 209 before updating the shared panel and storefront.
3. New repositories request metadata using the transaction-local
   `saas.required_pages_projection_version=1` setting. Old callers retain their
   exact legacy DTO shape; this setting grants no authority.
4. Deploy the common panel and storefront, preserving the independently
   published storefront navigation changes. Verify every tenant/domain.

The migration down script refuses populated mappings/seed history instead of
destroying tenant content. Rolling back an app must retain SQL 209.
