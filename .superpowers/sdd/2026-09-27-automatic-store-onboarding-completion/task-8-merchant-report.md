# Task 8 — isolated merchant acceptance

## Scope and authority

Owned files are only `tests/saas-phase2/onboarding-resilience/merchant-acceptance-postgres.test.mjs` and this report. No application source, package configuration, role/grant, live SQL or deployment change is part of this subtask.

The executable harness accepts only the explicit opt-in `merchant-acceptance-20260928`, database `onboarding_merchant_qa_20260928`, and exact task-owned marker `celebix-task-owned-disposable-onboarding-20260927`. Its connection is fixed to `127.0.0.1:56417`, with no URL fallback. It rejects ambient PostgreSQL, database URL and Supabase authority, including empty values. Before fixtures, it checks the actual database name, marker, PG major version16 and zero stores. Existing synthetic graphs cannot be replaced or reused by a second clean run.

## Acceptance coverage

- Actual persistent registration attempt/verified-identity/completion repositories and actual Tenant Core create one tenant graph; repeated completion resolves the same operation. Identity is explicitly synthetic (`.invalid` issuer/email); encryption/digest keys exist only in memory. This does not prove real OIDC or email delivery.
- Actual app-role catalog repository creates the first draft product and replays the same operation. A draft is not presented as a sellable active product.
- Existing image validation accepts a complete locally generated one-pixel PNG. The existing upload saga uses actual PostgreSQL media reservation/lifecycle/list methods, plus an exact tenant/product namespace Map object port. It verifies bytes/digest and a single local object write across retry. No R2 or public image endpoint is called.
- Actual design repository reads the seeded published starter, saves a bounded brand-color edit, and publishes with expected draft/publication versions and replayed idempotency keys. Pending edits and the newly published state are reflected by the actual setup loader/model.
- Actual merchant-admin repository saves a draft then active delivery fee1489 cents with optional365-day estimate. The existing internal checkout shipping projection is inspected under its existing owner role in a read-only transaction; the fee and days must round trip exactly. SQL072 explicitly denies direct workload-role access to this helper, so this inspection is not a claim of an exposed public checkout endpoint.
- Actual setup loader aggregates repository reads. Products remain action required for the single draft; published design and active fee become ready; payment stays absent. Technical access remains unavailable because local SQL does not prove TLS/public routing. No placeholder access success is injected.
- Counts assert one unchanged tenant graph, one draft product/media/delivery row, zero orders/payment methods/payment attempts/provider profiles. The fetch boundary is denied and its counter must remain zero.

## Commands and results

Default guard/image/factory command:

```sh
node --conditions=react-server --experimental-transform-types --test tests/saas-phase2/onboarding-resilience/merchant-acceptance-postgres.test.mjs
```

Result:3 unit/guard tests passed; the actual PG modes are skipped without explicit opt-in.

Actual disposable PG command:

```sh
CELEBIX_MERCHANT_ACCEPTANCE_QA=merchant-acceptance-20260928 \
CELEBIX_MERCHANT_ACCEPTANCE_DATABASE=onboarding_merchant_qa_20260928 \
CELEBIX_MERCHANT_ACCEPTANCE_MARKER=celebix-task-owned-disposable-onboarding-20260927 \
node --conditions=react-server --experimental-transform-types --test tests/saas-phase2/onboarding-resilience/merchant-acceptance-postgres.test.mjs
```

The first full fresh run passed creation/replay, product/media, design draft/publication/replay and draft fee before stopping on the private projection-role assumption described below. It is **not reported as a whole fresh-harness pass**. The parent approved finishing only the existing draft fee on the same graph after the read-only gate. No production build is required for this test-only subtask; the release source is frozen independently.

### Read-only prerequisite gate

Using the same explicit database/marker/opt-in with `CELEBIX_MERCHANT_ACCEPTANCE_MODE=preflight`, the existing synthetic graph passed **4 tests** (3 unit guards plus actual PG read-only preflight); the fresh mutation path was skipped.

The actual gate verified all remaining constructors/read ports and final count assertions: app-role catalog/media/design/domain/payment/setup reads; shipping save's existing EXECUTE privilege; real merchant actor/plan authority; the current365-day config validator; the existing owner-only internal projection; and public host-resolver storefront/design/product reads. Published version2 and brand color `#224466` are visible in the actual public repository, while the single draft product remains absent from the public active catalog. Graph and sales counts were identical before/after. External network calls:0. No role/grant mutation or fixture reset was used.

The internal projection's permission was checked and exercised before the next write. The parent approved bounded continuation of the same graph; no further fixture graph was created. Preflight also supports the accepted active version2 state, enabling a subsequent read-only verification without rerunning mutations.

After the accepted continuation, the same explicit command with `CELEBIX_MERCHANT_ACCEPTANCE_MODE=preflight` passed again: **4 tests passed, 2 mutation modes skipped**; the actual PG read-only test took 6.6 seconds. It confirmed the active projection at 1489 cents / 365 days, public design version 2, zero public active products, unchanged graph/sales counts and zero external network calls. The continuation was not rerun.

### Final bounded continuation

The explicit database/marker/opt-in command with `CELEBIX_MERCHANT_ACCEPTANCE_MODE=continue-delivery` passed **4 tests** (3 unit guards plus actual PG continuation; preflight and fresh paths skipped). The continuation itself took9.0 seconds.

Before writing, it required exactly one marked synthetic tenant graph, the matching completed registration, one existing draft delivery record at version1, and the exact original creation-operation canonical fingerprint. The only mutation used the existing app-role merchant-admin save port to activate that same record with its real expected version. No registration call, create operation, object recreation, version bypass or grant change was made.

The real PostgreSQL COMMIT completed, then the test transport deliberately lost its response and the subsequent automatic recovery response. A regular retry with the same operation and unchanged payload returned replayed version2 on the same record. Another replay preserved version2; a changed fee payload with that key returned `operation_mismatch`.

Final actual results:

- Internal owner-role read-only checkout projection:1489 cents,365 days.
- One draft product, one active media row, one delivery record, published design version2.
- Orders, payment methods, payment attempts and provider profiles:0.
- Actual setup states: products `action_required`, design `ready`, delivery `ready`, payment `none`, access `unavailable`.
- All one-tenant graph counts stayed1; row-count/hash snapshots of10 existing merchant tables were identical before/after the delivery change.
- External network calls:0. The object store remains a memory fixture only.

The prior fresh stages, read-only preflight and this bounded continuation are separate evidence. Synthetic graphs and immutable operation evidence remain in their task-owned QA databases.

## Harness corrections and preserved evidence

The initial loopback probe timed out before writes; the parent restored its task-owned tunnel. Two early harness errors were then diagnosed: passing the crypto UUID function directly to a kind-aware ID factory failed before any tenant operation/store was written; adding an unsupported UUID option to the payment-method repository constructor failed after the one tenant graph and registration replay were created. Both are test adapter errors, with no production source changes. The real constructor factory is now tested before any fixture mutation.

The prior `onboarding_migrations_qa_20260928` synthetic graph and immutable registration evidence were preserved. The parent prepared a separate fresh `onboarding_merchant_qa_20260928` from schema-only reference data and frozen source `3de4bbcdb2808a97e4add42023356b0af2dae046`, with SQL167/168/169 and assertions. Its first full run completed creation/replay, product/media, draft save/publication/replay and draft fee, then stopped on the harness's incorrect workflow-role assumption for the explicitly private shipping projection. This was corrected to an existing owner-role read with no grant expansion. The current graph was preserved and the complete read-only prerequisite gate above passed before proposing further writes. This harness's allowlist rejects the old migrations database. No fixture delete/reset, role/grant change or recovery evidence cleanup was performed here.

## Limits

This evidence proves real PG16 repository integration with synthetic identity and memory object storage, through the separate stages described above. The fresh mode has a strict zero-store precondition and was not rerun after the graph was accepted; the completed continuation intentionally refuses an already active fee. It does not prove browser login, real verification email/OIDC, public TLS/tenant routes, R2 transfer/rendering, shipping-provider connection, a public checkout endpoint, or payment/provider/order execution. Those boundaries belong to the parent's separately scoped acceptance/release checks.
