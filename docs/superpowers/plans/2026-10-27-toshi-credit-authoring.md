# Toshi Credit Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Ship central Toshi product/SEO/image-alt generation with visible selected-field credit charges and purchasable per-store balances.

**Architecture:** Preserve native content-authoring operations/provenance, add a durable wallet reserve/finalize layer, and bind a central encrypted DeepSeek credential through the existing provider authority. Independent image generation uses bounded inline thumbnails, fixed provider and an operation-bound cached result. Existing iyzico platform checkout fulfills credit offers atomically.

**Tech Stack:** TypeScript/Next.js/React, existing native PostgreSQL roles, DeepSeek Chat Completions, iyzico Checkout Form.

**Spec:** `docs/superpowers/specs/2026-10-27-toshi-credit-authoring-design.md` (approved conversation).

## Global Constraints

- Selected costs: description7, title1, meta2, image1 each; no customer-controlled amounts/authorities/provider URL.
- Generated title60/meta160 characters; existing saved metadata unaffected.
- Preserve server tenant/session origin authority, generation provenance, immutable tariffs/signup proof and existing payments.
- No API requests while SQL transactions are open; no unbounded retries, stale-field writes or automatic real purchases.

## Review Focus

- Concurrent same-operation requests dispatch once and deduct once.
- Lost completion/failed image returns cannot charge twice or grant credit twice.
- New unsaved product images and reordered existing images apply alt text by identity.
- Selected SEO-only/description-only output leaves every unselected value unchanged.
- Existing paid subscription, tools, bank returns and store signup remain compatible.

## Task1: Durable wallet and verified purchases (credit backend agent)

**Files:** New `packages/saas-contracts/src/toshi/credits.ts`, `packages/saas-data/src/toshi-credits/*`, migration283, `apps/customer-panel/lib/server-toshi-credits/*`, credit GET route; extend platform commerce parser and owner public projection.

**Interfaces:** Repository `getWallet`, `reserve`, `complete`, `fail` accept verified tenant+now; reservation additionally operationId,64hex fingerprint,cost; completion stores bounded result+chargedCredits. Reserve returns kind created/replayed/pending and cached result. Wallet balance/reserved/available are safe integers. Offer IDs/prices as spec.

- [ ] Add failing native/repository tests for replay, concurrent reserves, insufficient funds, cross-store and once-only paid fulfillment.
- [ ] Implement short-transaction wallet ledger and additive verified purchase support.
- [ ] Run focused unit and disposable native PostgreSQL tests.

## Task2: Shared editor, wallet and image bridges (UI agent)

**Files:** `components/content-authoring/*`, description editor, product create/detail/advanced editor and media manager, Toshi settings, content authoring client.

**Interfaces:** Existing generation request action adds `auto`; credit GET as spec. Image bridge captures `{id,url?,file?,altText,variantLabel?}`; validates/applies result by stable ID and current draft. API image request/response as spec.

- [ ] Add failing behavior tests for action labels, credit totals, no action controls, selected-only application and stale image binding.
- [ ] Implement orange toolbar button, simplified panel, thumbnail batching, credit balance/offers and existing checkout handoff.
- [ ] Run focused behavior tests and responsive/keyboard QA.

## Task3: Central generation and bounded image endpoint (root)

**Files:** `server-content-authoring/{service,runtime}.ts`, shared content request validation/types, central Toshi credential helper, image-alt service/http/route, postgres-runtime registration.

- [ ] Add failing tests for automatic action,60/160 boundaries, selected-field costs and central provider use.
- [ ] Bind central encrypted credential without exposing it or customer BYOK; reserve/settle product generation around durable existing operation.
- [ ] Implement thumbnail-bound actual-image requests and cache/replay/partial charge handling with mocked network tests.
- [ ] Preserve old saved result parsing and native source/claim contracts; validate new output before wallet settlement.

## Task4: Integration, release and acceptance (root)

- [ ] Independent review of monetary, identity and provider boundaries; repair concrete findings.
- [ ] Verify native tests, affected app builds, exact-candidate signup guard and main checkout kind compatibility.
- [ ] Apply additive migration with assertions; securely configure central key, publish owner then panels NET→SITE.
- [ ] Verify running candidate, Ezmeo credits/UI and nonmutating storefront smoke. Record explicit test credit grant if needed; no real card charge.

## Rulings

- No further design gate: the user explicitly approved implementation in the current turn.
- Existing isolated checkout reused; original dirty working tree untouched. Root owns release sequencing.
- Image alt1credit is a customer fixed operation price; real vision consumption must remain bounded and recorded separately.
