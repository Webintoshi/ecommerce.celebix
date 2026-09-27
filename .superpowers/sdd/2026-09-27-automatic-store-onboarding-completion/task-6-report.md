# Task 6 — Truthful tenant setup checklist

## Scope and result

Implemented the approved Task6 brief in the shared onboarding worktree. Source references include the root storefront capabilities foundation `27fcede5` and execution-availability helper `0521a0f9`; those foundation files were read and remain unmodified here.

Owned files: customer-panel `lib/server-setup/{types,loader,default,edge-client}.ts` and their tests; `lib/setup-ui/{model,presentation,fixtures}.ts` and tests; `components/setup/{SetupChecklist.tsx,setup-checklist.module.css,SetupChecklist.behavior.test.ts}`; setup page; customer-panel test globs; this report. No SQL, grants, provider calls, live data changes or deployments were added. Task5 follow-up was separately committed as `acc3f16d` before this task resumed.

`loadSetupStatus(context)` returns separate access/products/design/domains/delivery/payment items. Each uses `ready`, `action_required`, `unavailable` or `restricted`; payment additionally distinguishes `none`, `offline`, `configured`, `test`, `live`, `unavailable`. Safe fixed navigation is added only by presentation. No raw dependency errors, arbitrary domain/store query, customer-supplied authority or hardcoded completed checklist is displayed.

## Sources and authority

- The page first calls existing `requireServerPanelAccess()` and passes that exact server-established tenant context to the loader. The loader reads the six bounded ports in parallel with a common time, checks existing action/feature permissions before protected reads, and maps failure/denial to unavailable/restricted. Simultaneous tenants never share a result object or authority.
- Product readiness reads the existing catalog dashboard summary. Zero active products require merchant action while technical access remains independent.
- Design reads the existing storefront-design workspace. A valid published blank starter is ready; optional logo is a recommendation. Unpublished draft changes are identified separately without treating publication and draft counters as interchangeable. No design/default/version/media records are rewritten.
- Domain configuration reads existing tenant-scoped `domains.list`. A unique primary active/verified domain with active UI status is configured. Its existing lifecycle runtime can be unavailable independently of technical access.
- Delivery reads the existing generic merchant-admin shipping-setting list. Only the latest active record with an explicit integer fee is ready, including explicit0. Provider connectivity is not used as pricing evidence. A full200-record window with no active result is **unavailable**, since an older active checkout record may be outside that bounded window. Drafts and malformed/missing fees never become ready.
- Payment methods and masked public profile metadata use existing authorized repositories. Offline methods remain a separate manual-method result; profile reading is skipped for an active offline method. Provider profile reads require existing integrations permission/feature. Active provider method/preferences must match an active, validated current profile/environment, admin compiled execution evidence/descriptor/packet/adapter metadata, and the actual storefront capabilities response before live readiness is possible. Test, disabled, missing or mismatched execution does not imply live readiness. No credential or provider execution API is invoked.
- The jobs snapshot is deliberately unused: its reader is identity-only and panel permissions are not expanded.

## Technical access probe

The owned server client uses configured approved NET/SITE staging authority and `CELEBIX_ONBOARDING_EDGE_ADDRESSES`. The canonical admin and storefront hostnames are derived only from the established store slug and approved platform suffix. The central panel origin must match that suffix. It rejects unsafe/reserved/multiple-label slugs and invalid/private IP allowlists.

Each HTTPS GET resolves the expected hostname, rejects DNS results outside the explicit public-IP allowlist, and pins an approved result with exact Host/SNI and normal TLS certificate verification. It sends no session, credential or trusted-proxy token. The actual edge supplies its existing trusted storefront middleware. Requests have a five-second DNS+HTTP deadline and256KiB body limit. Redirects are rejected, so arbitrary customer domains cannot become network authority.

The probe checks existing admin/storefront `/api/health` payloads for exact schema/status/storeId/hostname, preserving their optional dependency metadata without using it as tenant authority. It also reads central panel `/login`, canonical admin `/login` and storefront `/`, plus the root-owned `/api/setup-capabilities`. Capabilities are exact small allowlisted public metadata, verified against the same storeId/hostname; contradictory/extra provider fields fail closed. Disabled or unavailable payment metadata is retained separately from a successful technical access proof.

Technical health does not depend on Cloudflare API credentials. Missing allowlist, DNS/TLS/HTTP/identity proof failure or unavailable runtime yields `unavailable`. Successful health/landing reads indicate technical access at the time of the read; they do not declare the merchant's sales setup complete.

## Red → green evidence

- Initial pure model regressions failed against the unimplemented aggregate: empty catalog/optional logo, published blank design, active explicit fee, read failures/permissions and actual online-payment availability. Those5 tests passed after implementation.
- Edge client's three initial tests failed against its unimplemented ports. Production-shaped health payloads with optional `dependencies` exposed an overly strict parser; the focused regression failed before accepting that existing field without granting it authority.
- The actual old setup page failed the new page test because it never established/read a tenant or rendered merchant actions. The replacement invokes the established context and renders the real aggregate. Presentation's initial tests also failed before implementation.
- A malformed `disabled` storefront result carrying a live provider exposed a model fallback that could claim live; its new regression failed before requiring `payment.kind === ready` for execution matching.
- The full200-delivery-window regression failed as action_required before changing it to unavailable/unknown.

Final commands:

```sh
node --experimental-transform-types --test apps/customer-panel/lib/setup-ui/*.test.ts apps/customer-panel/components/setup/*.test.ts
node --conditions=react-server --experimental-transform-types --test apps/customer-panel/lib/server-setup/*.test.ts
npm run typecheck --workspace=@celebix/customer-panel
```

Results: **11 pure/component tests passed;7 server tests passed; customer-panel typecheck passed**. Server tests use the separate `react-server` condition. Package globs preserve Task4's existing session-completion registration and add the pure/component and server setup tests to the appropriate commands.

Coverage includes simultaneous tenant isolation, exact established context, read/plan/role failures avoiding protected ports, unavailable reads, malformed/unknown host proofs, strict TLS/SNI/IP pinning, unsafe DNS and redirect/body limits, real five-second stalled-DNS timeout, configured/test/live/offline payment distinctions, mismatched/disabled evidence, current active fee/draft/full-window cases, safe fixed actions and accessible page composition. No live API or PG writes were needed for Task6.

## UI verification

Function inventory: read actual readiness; distinguish technical access from sales setup; navigate to the existing product/design/domain/shipping/payment workflows; show an optional recommendation; retry access read. Existing workflows and permissions are preserved.

Page pattern: flat grouped operational checklist, one semantic hidden h1, concise section labels, neutral existing shared tokens, no visible repeated title. Restricted rows omit actions. Safe destinations are `/setup`, `/products/new`, `/settings/design`, `/settings/domains`, `/settings/shipping#checkout-delivery`, `/settings/payment`.

A temporary local synthetic fixture compiled the **actual** component/CSS/model/presentation with the actual shared contract parsers. It supplied only synthetic data and an outer neutral frame; no real tenant session or provider runtime was touched. Chrome verification at1440/1024/390 passed:

- Zero document horizontal overflow and no clipping/overlap in desktop, intermediate and full mobile screenshots.
-44px action targets; keyboard Tab reached the first action with a visible2px outline.
- Empty catalog and optional-logo recommendation displayed independently of ready access.
- Restricted product state omitted its link; unavailable delivery/payment showed safe short feedback.
- Browser console warnings/errors: none.

Screenshots were emitted through the browser tool. The temporary viewport override was reset, the agent-created tab was closed and the loopback fixture server was stopped.

## Limits / parent integration gate

- Full authenticated page verification against a real tenant remains the parent's integration check. Synthetic tests prove rendering/aggregation/probe contracts; they do not claim that the current deployed containers already expose the new foundation route or have the panel edge allowlist configured.
- Customer-panel must receive the explicit public edge-IP allowlist. Missing configuration stays unavailable; no unsafe DNS fallback or new provider token is introduced.
- Cross-host canonical redirects deliberately stay unavailable in this platform-only probe. Existing domain/canonical redirect behavior is unchanged.
- The parent owns the final combined production build after Task5/6/7 completion and independent review. No concurrent Panel build was started here, following the explicit shared build-lock instruction. Typecheck and focused gates pass; production-build acceptance remains a parent gate.
- No global database authority, jobs reader authority, payment flags, provider activation, preview values or merchant records were changed.
