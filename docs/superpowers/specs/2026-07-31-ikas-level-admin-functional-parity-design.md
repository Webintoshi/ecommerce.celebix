# Celebix Admin Functional Parity Design

**Date:** 2026-07-31

**Status:** User-approved for continuous implementation without per-module confirmation

**Target:** `apps/customer-panel`

## Outcome

Turn the shared Celebix merchant panel into a production-capable administration product. İkas is the workflow-depth reference; Celebix keeps its own brand, navigation shell, terminology, security model, PostgreSQL authority, and responsive visual language.

This program applies to every visible main route and subroute. A route is not complete merely because it renders, stores a generic record, or has a unit test. It is complete only when a merchant can finish the route's advertised job with durable tenant-scoped data and truthful external side effects.

## Product rule

Every main page and subpage must pass the same seven gates:

1. **Truthful data:** visible values come from the active store's PostgreSQL records; fabricated metrics and sample success states are forbidden.
2. **Complete task:** primary create, read, update, lifecycle, archive, export, print, or provider action promised by the page is usable end to end.
3. **Authority:** every read and mutation is reauthorized from the durable panel session and current membership; browser-provided tenant authority is rejected.
4. **Operational feedback:** loading, empty, denied, conflict, unavailable, success, and retry states are explicit and safe.
5. **Responsive interaction:** desktop and mobile preserve information hierarchy, keyboard access, readable controls, and at least 44px primary hit targets.
6. **Evidence:** contract, repository, HTTP, UI, build, PostgreSQL migration, and live browser checks exist in proportion to the change.
7. **Truthful release:** provider-dependent actions remain visibly gated until the real provider confirms the side effect; a local status change never impersonates payment, refund, shipment, invoice, message delivery, or marketplace synchronization.

## Completion vocabulary

The existing donor parity manifest is a route and narrow-action inventory, not a statement of İkas-level product completeness. Product reporting uses these states:

- `foundation`: the canonical route and secure authority exist, but the merchant workflow is incomplete.
- `operational`: the store can complete every supported local workflow with durable PostgreSQL state.
- `provider_gated`: local configuration is real, but an advertised external effect remains disabled until its approved adapter is live and verified.
- `production_ready`: local workflows and every enabled external effect pass live tenant-isolation and browser evidence.

No module may be called production-ready while a visible primary button is decorative, uses `alert()`, writes only client state, records a preparation as a completed external action, or lacks its exact detail/edit destination.

## Shared architecture

Each module follows the same vertical slice:

```text
strict immutable contract
  -> additive PostgreSQL schema and SECURITY DEFINER API
  -> tenant-authorized repository
  -> server runtime preflight
  -> same-origin HTTP boundary
  -> strict browser client
  -> Celebix presentation and responsive states
  -> live browser proof
```

The browser receives only safe resource DTOs and opaque resource IDs. Store, tenant, principal, membership, plan, database, credential, and provider-secret authority stays server-side. Mutations use exact Origin validation, operation UUIDs, canonical fingerprints, optimistic versions, idempotent recovery, and immutable audit events.

## Information architecture and delivery order

The program is delivered as independently deployable modules in this order:

1. **Siparişler:** list, detail workspace, fulfillment, shipping/billing addresses, payments, payment links, cancellation, provider-confirmed refunds, tags, internal timeline, print/invoice/shipping artifacts, quick orders, abandoned carts.
2. **Müşteriler:** list/detail/edit, addresses, consent, notes, tags, segments, order history, export, privacy-safe archive.
3. **Ürünler ve stok:** product/variant/media lifecycle, collections, brands, attributes, extras, reviews, barcode labels, bulk import, locations, purchasing, counts, transfers, price lists.
4. **İndirimler, pazarlama ve içerik:** discount rules and usage, lucky-wheel lifecycle, campaigns and delivery evidence, blog/pages/policies and publication state.
5. **Ayarlar ve ekip:** general/language/design/shipping/payment settings, administrators, permissions, notifications, domains and storefront status.
6. **Pazar yerleri, muhasebe ve SEO:** provider connections, sync jobs and evidence, invoice lifecycle/reconciliation, sitemap/social/code/indexing execution.
7. **Dashboard and analytics:** only aggregates backed by completed modules, with exact timestamps and partial/unavailable states.

The shared shell and authentication remain cross-cutting release gates for every module.

## First delivery: order workspace

The first implementation replaces the long form-like order detail with a focused merchant workspace inspired by the observed İkas hierarchy:

- a compact top strip with back navigation, order number, status badges, print, previous and next order controls;
- a primary column for fulfillment state, ordered products, customer/address facts, and the immutable staff timeline;
- a sticky summary rail for creation/source, subtotal, shipping, discounts, taxes when available, total, payment state, tags, and permitted actions;
- edits live in explicit drawers/dialogs or bounded forms instead of exposing every address field permanently;
- cancel and refund are separate named workflows with confirmation, reason, idempotency, audit, and version conflict handling;
- payment links are created only through a real hosted-checkout authority and are copyable/revocable without exposing provider credentials;
- card refunds become successful only after the active provider's verified response; cash-on-delivery and bank-transfer adjustments follow their own local financial rules.

The first deployable increment uses the currently persisted order, shipping, tracking, note, event, and status data to deliver the workspace hierarchy plus deterministic previous/next navigation. Structured billing, taxes, fulfillment locations, tags, payment transactions, hosted payment requests, invoices, shipping labels, and provider refunds follow as additive order increments and stay truthfully absent until their durable slice is live.

## Module execution contract

For every later route, the implementation loop is fixed:

1. inspect the equivalent İkas workflow and the current live Celebix route;
2. inventory visible promises, real data dependencies, mutations, external effects, permissions, and responsive states;
3. mark unsupported promises as gaps rather than complete;
4. write a failing behavior test;
5. implement the smallest complete vertical slice;
6. run module, workspace, typecheck, build, PostgreSQL, and live browser evidence;
7. commit, push, migrate, deploy, and verify on a real tenant without mutating business data during smoke tests.

## Error and safety policy

- Cross-store, stale-session, stale-version, unsupported transition, missing provider, malformed payload, and unknown-commit cases fail closed.
- A provider timeout or unknown result is never converted to success; reconciliation owns the final state.
- Financial amounts use safe integer minor units and a canonical currency.
- Destructive or financial actions require an explicit confirmation surface and a server-side reason where the domain requires it.
- Timeline events are immutable. Internal notes are merchant-only and retain author and timestamp identity in their safe projection.
- Existing stores and their routes remain usable during additive migrations; new fields receive coherent backfills or remain optional until populated.

## Verification and definition of done

A module is production-ready only when:

- its route matrix has no dead destination or missing detail/edit page;
- every advertised action reaches a real server boundary and produces durable or provider-confirmed state;
- unauthorized roles cannot perform the action even by direct HTTP request;
- loading, empty, error, conflict, success, responsive desktop, and responsive mobile states are verified;
- relevant package tests, typechecks, production builds, migration rehearsal/assertion/rollback/reapply, and live health checks pass;
- live DOM, console, screenshot, and at least one safe interaction prove the deployed behavior;
- the functional maturity ledger matches the evidence and contains no unsupported `production_ready` claim.

## 2026-08-01 live parity audit

The user approved continuous page-by-page comparison against the authenticated İkas merchant panel. The comparison is capability based: Celebix does not copy İkas branding or source code, but every supported merchant job must be at least as complete, durable, safe, and usable.

The live audit confirmed that Celebix is already at parity or ahead in these areas:

- dashboard sales, order, customer, catalog, stock, and growth metrics backed by the active store;
- product list search, filters, import, export, bulk lifecycle actions, detail routes, and extended catalog taxonomy;
- purchasing, stock counts, stock locations/transfers, price lists, barcode labels, and bulk catalog migration;
- order list search, status/payment/delivery filters, sorting, CSV export, real detail routes, shipping edits, internal notes, immutable history, print, and deterministic neighboring orders;
- customer list/detail/edit, address book, order history, segments, tags, notes, export, and archive;
- content, SEO, payment settings, marketplace configuration, accounting configuration, and tenant-branded authentication.

The audit identified these remaining parity gaps. A visible substitute does not count unless it completes the same merchant job:

1. **Order extensions:** durable draft orders, manual order creation from a draft, order tags, gift cards, structured billing address, hosted payment request links, invoice artifacts, and shipping labels.
2. **Inbox:** merchant message list/detail, assignment/status, customer context, channel settings, and truthful provider delivery evidence.
3. **Marketing depth:** automation rules and runs, popup lifecycle, affiliate records/reports, and consolidated channel/provider settings. Existing e-mail, phone, and WhatsApp records remain preparation-only where delivery adapters are absent.
4. **Reporting:** live tracking, dedicated sales and conversion reports, products bought together, purchasing reports, and crawler reports. Dashboard and analytics aggregates may be reused, but each report needs its own filters, explanations, export, and unavailable states.
5. **Applications:** installed-application inventory and a Celebix-approved integration catalog. Installation must never imply provider authorization before the provider account and scopes are verified.
6. **Advanced store settings:** tax rules, dynamic contracts, domains, product search/filter configuration, shipping-label templates, customer custom fields, number/currency formatting, store activity history, e-mail-domain configuration, SMS provider configuration, account-deletion requests, migration jobs, and AI-image history.

The following İkas concepts are mapped to existing Celebix capabilities rather than duplicated:

- İkas customer groups map to Celebix customer segments.
- İkas stock locations and transfers map to Celebix stock location/transfer workflows.
- İkas marketing customer segments map to the shared Celebix customer-segment authority.
- İkas AI assistant maps to Toshi, subject to tenant-safe read and action boundaries.
- İkas sales-channel management maps to the verified storefront plus marketplace connection model.
- İkas contracts map to Celebix policy/content records only after dynamic template variables and publication evidence are implemented.

## Remaining delivery waves

Remaining work is delivered in independently deployable waves so existing stores never wait for the entire program:

1. **Commerce core:** draft/manual orders, order tags, gift cards, billing, payment requests, invoice and shipping artifacts.
2. **Inbox and marketing:** conversations, channel settings, automation, popup, affiliate, and delivery/run evidence.
3. **Operational reporting:** live, sales, conversion, bought-together, purchasing, and crawler workspaces.
4. **Applications and advanced settings:** integration catalog/installed apps followed by the advanced store-setting gaps.
5. **Full regression:** every main route and subroute is exercised through list, detail, create, edit, lifecycle, empty, error, role, tenant, desktop, and mobile states. Sign-up, sign-in, sign-out, and store-specific admin handoff remain release gates.

Each wave follows test-driven vertical slices and is committed, pushed, migrated, deployed, and verified on Güzide Kuyumcu before the next wave starts. Provider-dependent work remains `provider_gated` until a verified external response proves the side effect.
