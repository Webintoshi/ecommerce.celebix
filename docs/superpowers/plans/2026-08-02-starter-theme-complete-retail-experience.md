# Starter Theme Complete Retail Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing Celebix `starter` theme into the complete admin-driven retail experience approved in the nine visual references, without weakening store, catalog, cart, checkout, review, policy, or media authority.

**Architecture:** Extend the finite starter composition to schema v2 and the immutable public presentation to schema v3, then resolve every catalog/media/review/footer value under the hostname-selected store. Build the customer-panel composer and shared storefront against those contracts, add a real tenant-isolated newsletter write, and preserve v1/v2 compatibility through pure adapters.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Node test runner, PostgreSQL 16, CSS Modules, existing `@celebix/saas-contracts` and `@celebix/saas-data` workspaces.

## Global Constraints

- `apps/admin/**` remains byte-for-byte unchanged.
- No donor source, assets, copy, brand identifiers, iframe, reverse proxy, or arbitrary page-builder runtime.
- Store selection remains hostname-resolver authority; browser tenant/store selectors are forbidden.
- Prices, stock, badges, variants, reviews, policies, assets, cart, checkout, and payment remain server-authoritative.
- No custom HTML, CSS, JavaScript, font URL, arbitrary image URL, or unreviewed external link input.
- New optional sections hide when real data is absent; no fake content or success state.
- No new dependency unless a separately reviewed implementation proves native React/CSS insufficient.
- No deployment, production mutation, DNS change, credential change, or merge in this plan.
- All feature changes follow red/green TDD and each task ends in an independently reviewable commit.

---

### Task 1: Versioned starter contracts and compatibility adapters

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts:11-205`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:170-410`
- Modify: `packages/saas-contracts/src/storefront/presentation.ts:1-120`
- Modify: `packages/saas-contracts/src/storefront/index.ts:1-20`
- Modify: `packages/saas-contracts/src/index.ts:390-410`
- Modify: `packages/saas-contracts/src/storefront/campaign-starter.test.ts:1-230`
- Create: `packages/saas-contracts/src/storefront/retail-presentation.test.ts`

**Interfaces:**
- Consumes: existing `StarterThemeCompositionConfig`, `PublicStarterThemePresentationV1/V2`, `PublicProduct`, and `StorefrontPolicyKey`.
- Produces: `StarterThemeCompositionConfigV2`, `StarterThemeSectionConfigV2`, `StarterFooterConfig`, `PublicStarterThemePresentationV3`, `PublicStarterReview`, and `PublicProductMerchandising`; `adaptStarterPresentationV2(value): PublicStarterThemePresentationV3`.

- [ ] **Step 1: Write failing exact-contract tests**

```ts
test("composition v2 accepts retail sections and rejects fake testimonial copy", () => {
  const value = compositionV2({ sections: [
    { kind: "value_propositions", enabled: true, items: [
      { icon: "shield", heading: "Güvenli alışveriş", body: "Korunan ödeme akışı." },
      { icon: "return", heading: "Kolay iade", body: "Yayımlanmış koşulları inceleyin." },
    ] },
    { kind: "testimonials", enabled: true, heading: "Sizden gelenler", source: "approved_product_reviews", limit: 3, minimumRating: 4 },
  ] });
  assert.equal(parseStarterThemeCompositionConfig(value).schemaVersion, 2);
  assert.throws(() => parseStarterThemeCompositionConfig({ ...value, sections: [{ ...value.sections[1], quotes: ["sahte"] }] }));
});

test("presentation v3 is exact deeply frozen and v2 adapts without invented retail content", () => {
  const parsed = parsePublicStarterThemePresentation(presentationV3());
  assert.equal(parsed.schemaVersion, 3);
  assert.equal(Object.isFrozen(parsed.footer.groups), true);
  const adapted = adaptStarterPresentationV2(presentationV2());
  assert.deepEqual(adapted.sections.filter(({ kind }) => kind === "testimonials"), []);
  assert.equal(adapted.footer.newsletter.enabled, false);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test --workspace @celebix/saas-contracts -- --test-name-pattern='composition v2|presentation v3'`

Expected: FAIL because schema v2/v3 types and parsers are not defined.

- [ ] **Step 3: Implement the minimal finite contracts and parsers**

```ts
export type StarterValueIcon = "sparkles" | "cotton" | "heart" | "shield" | "truck" | "return";
export type StarterThemeSectionConfigV2 = StarterThemeSectionConfig | Readonly<{
  kind: "value_propositions"; enabled: boolean;
  items: readonly Readonly<{ icon: StarterValueIcon; heading: string; body: string }>[];
}> | Readonly<{
  kind: "testimonials"; enabled: boolean; heading: string;
  source: "approved_product_reviews"; limit: 3 | 6 | 9; minimumRating: 4 | 5;
}>;

export type PublicStarterThemePresentationV3 = Readonly<{
  schemaVersion: 3;
  // existing resolved fields retained
  visual: StarterThemeVisualV2;
  sections: readonly PublicStarterHomeSectionV3[];
  productDetail: StarterProductDetailConfigV2;
  footer: PublicStarterFooter;
}>;
```

Parsers must use exact key sets, bounded arrays/strings, enum selection, uniqueness checks, safe relative destinations, canonical reviewed social URLs, and recursive freezing.

- [ ] **Step 4: Run contracts tests and typecheck GREEN**

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`

Expected: all contract tests and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront packages/saas-contracts/src/index.ts
git commit -m "feat(storefront): extend starter retail contracts"
```

### Task 2: PostgreSQL publication, review/product information, and newsletter authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608020075_complete_starter_retail_experience.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608020075_complete_starter_retail_experience_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/202608020075_complete_starter_retail_experience.down.sql`
- Create: `apps/owner/scripts/sql/saas/phase4e-complete-starter-retail-experience-manifest.json`
- Create: `tests/saas-phase3/starter-retail-experience/postgres-harness.mjs`
- Create: `tests/saas-phase3/starter-retail-experience/static-security.test.mjs`
- Modify: `packages/saas-data/src/storefront/types.ts:1-40`
- Modify: `packages/saas-data/src/storefront/repository.ts:1-130`
- Create: `packages/saas-data/src/storefront/newsletter-repository.ts`
- Create: `packages/saas-data/src/storefront/newsletter-repository.test.ts`

**Interfaces:**
- Consumes: composition v2/public v3 contracts and existing `public_campaign_home`, product-review, catalog-resource, policy, hostname, and application-role authorities.
- Produces: `saas.public_starter_retail_home`, `saas.public_starter_product_detail`, `saas.public_newsletter_subscribe`, `saas.merchant_newsletter_list`; `NewsletterRepository.subscribe(input)` and `.list(input)`.

- [ ] **Step 1: Write failing repository and PostgreSQL scenarios**

```ts
test("newsletter subscription sends only hostname-derived store input and fixed consent", async () => {
  const repository = createNewsletterRepository(pool);
  await repository.subscribe({ hostname: "shop.example.test", now, email: "ada@example.test", consentVersion: "starter-v1" });
  assert.match(pool.calls[0]!.text, /saas\.public_newsletter_subscribe/);
  assert.deepEqual(pool.calls[0]!.values, ["shop.example.test", now, "ada@example.test", "starter-v1"]);
});
```

Harness scenarios must start RED for missing migration 075 and prove cross-store publication rejection, approved-review-only projection, inactive product exclusion, newsletter isolation, idempotency, concurrent double-submit, existence privacy, RLS/ACL, backup/restore, rollback/reapply, and cleanup.

- [ ] **Step 2: Run RED tests**

Run: `npm test --workspace @celebix/saas-data -- --test-name-pattern='newsletter'`

Run: `node tests/saas-phase3/starter-retail-experience/postgres-harness.mjs`

Expected: FAIL because repository/functions/table do not exist.

- [ ] **Step 3: Implement migration and repository**

```sql
CREATE TABLE saas.storefront_newsletter_subscribers (
  store_id uuid NOT NULL,
  email_digest character(64) NOT NULL,
  normalized_email text NOT NULL,
  status text NOT NULL,
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  version bigint NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (store_id, email_digest),
  FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK (status IN ('subscribed','unsubscribed'))
);
ALTER TABLE saas.storefront_newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_newsletter_subscribers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.storefront_newsletter_subscribers FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
```

The subscribe function normalizes and validates email, resolves the store from exact hostname, locks/upserts one `(store_id,email_digest)` row, never returns existence, and returns only `{ outcome: "subscribed" }`. Public v3 projection resolves assets/categories/pages/resources/reviews by `store_id` on every join.

- [ ] **Step 4: Run GREEN repository and PostgreSQL suites**

Run: `npm test --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/saas-data`

Run: `node tests/saas-phase3/starter-retail-experience/postgres-harness.mjs && node --test tests/saas-phase3/starter-retail-experience/static-security.test.mjs`

Expected: all focused tests and every declared PostgreSQL scenario PASS; cleanup leaves no disposable container/database.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas packages/saas-data/src/storefront tests/saas-phase3/starter-retail-experience
git commit -m "feat(storefront): persist complete starter retail authority"
```

### Task 3: Customer-panel retail composer

**Files:**
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.ts:1-260`
- Modify: `apps/customer-panel/lib/starter-theme-composer-model.test.ts:1-260`
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx:1-265`
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx:1-260`
- Modify: `apps/customer-panel/components/settings/starter-theme-composer.module.css:1-end`
- Create: `apps/customer-panel/components/settings/StarterRetailSectionEditors.tsx`
- Create: `apps/customer-panel/components/settings/StarterFooterEditor.tsx`

**Interfaces:**
- Consumes: `StarterThemeCompositionConfigV2`, same-store categories/products/pages/assets, and current merchant-admin save/publish API.
- Produces: `createStarterThemeEditorStateV2`, `buildStarterThemeCompositionV2`, ordered section editors, product-detail controls, footer editor, and deterministic preview.

- [ ] **Step 1: Write failing model/static behavior tests**

```ts
test("new editor state exposes every approved retail section without fake content", () => {
  const state = createStarterThemeEditorState();
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.sections.map(({ kind }) => kind), ["product_row"]);
  assert.equal(state.footer.newsletter.enabled, false);
  assert.equal(JSON.stringify(state).includes("testimonial quote"), false);
});

test("composer renders value, testimonial, footer and product disclosure controls", async () => {
  const source = await readFile(composerUrl, "utf8");
  for (const label of ["Değer önerileri", "Müşteri yorumları", "Footer", "Bülten", "Malzeme ve bakım", "Sertifikalar"]) assert.match(source, new RegExp(label));
});
```

- [ ] **Step 2: Run RED tests**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/starter-theme-composer-model.test.ts`

Expected: FAIL on schemaVersion/footer/new section assertions.

- [ ] **Step 3: Implement minimal accessible editors**

```tsx
{section.kind === "value_propositions" ? <ValuePropositionsEditor section={section} update={update} /> : null}
{section.kind === "testimonials" ? <TestimonialsEditor section={section} update={update} /> : null}
<StarterFooterEditor value={state.footer} pages={pages} categories={categories} update={(footer) => patch({ footer })} />
```

Use typed pickers, finite selects, `maxLength`, visible errors, keyboard reorder buttons, and existing optimistic publish/version flow. Do not expose raw UUID or arbitrary URL text inputs except reviewed social profile URLs.

- [ ] **Step 4: Run GREEN customer-panel tests/typecheck**

Run: `npm test --workspace @celebix/customer-panel && npm run typecheck --workspace @celebix/customer-panel`

Expected: all customer-panel tests and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/starter-theme-composer-model* apps/customer-panel/components/settings
git commit -m "feat(customer-panel): manage complete starter retail theme"
```

### Task 4: Retail header and home sections

**Files:**
- Modify: `apps/storefront-shared/components/CampaignHome.tsx:1-45`
- Modify: `apps/storefront-shared/components/CampaignHeader.tsx:1-end`
- Modify: `apps/storefront-shared/components/CampaignHeaderClient.tsx:1-end`
- Modify: `apps/storefront-shared/components/CampaignHero.tsx:1-end`
- Modify: `apps/storefront-shared/components/CampaignPanels.tsx:1-end`
- Modify: `apps/storefront-shared/components/CampaignProductRow.tsx:1-end`
- Modify: `apps/storefront-shared/components/Footer.tsx:1-end`
- Create: `apps/storefront-shared/components/CampaignValuePropositions.tsx`
- Create: `apps/storefront-shared/components/CampaignTestimonials.tsx`
- Create: `apps/storefront-shared/components/RetailFooter.tsx`
- Modify: `apps/storefront-shared/components/campaign-home.module.css:1-end`
- Modify: `apps/storefront-shared/components/campaign-header.module.css:1-end`
- Modify: `apps/storefront-shared/app/globals.css:1-end`
- Modify/Test: `apps/storefront-shared/components/CampaignHome.test.ts`, `CampaignHeader.test.ts`, and `campaign-ui-model.test.ts`

**Interfaces:**
- Consumes: `PublicStarterThemePresentationV3` and `PublicStarterHomeSectionV3`.
- Produces: complete reference-led home composition and footer with real links/reviews.

- [ ] **Step 1: Write failing section/header/footer tests**

```ts
test("campaign home exhaustively renders the two retail section kinds", async () => {
  const source = await readFile(homeUrl, "utf8");
  assert.match(source, /case "value_propositions"/);
  assert.match(source, /case "testimonials"/);
  assert.match(source, /CampaignValuePropositions/);
  assert.match(source, /CampaignTestimonials/);
});

test("retail footer consumes resolved groups and never invents links", async () => {
  const source = await readFile(footerUrl, "utf8");
  assert.match(source, /storefront\.presentation\.footer/);
  assert.doesNotMatch(source, /https:\/\/|instagram\.com\//);
});
```

- [ ] **Step 2: Run RED storefront tests**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='campaign home|retail footer|campaign header'`

Expected: FAIL because new renderers and footer projection are absent.

- [ ] **Step 3: Implement server-first section rendering and responsive styles**

```tsx
case "value_propositions":
  return <CampaignValuePropositions section={section} />;
case "testimonials":
  return section.items.length ? <CampaignTestimonials section={section} /> : null;
```

Header must support overlay/solid state, centered logo, exact category disclosures, and real utility routes. Footer must render resolved groups, optional social links, and newsletter only when `enabled` is true. Use semantic lists/nav/details, stable image sizes, CSS grid, and no copied reference assets.

- [ ] **Step 4: Run GREEN storefront tests/typecheck**

Run: `npm test --workspace @celebix/storefront-shared && npm run typecheck --workspace @celebix/storefront-shared`

Expected: all storefront tests and typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/components apps/storefront-shared/app/globals.css
git commit -m "feat(storefront): render complete starter retail home"
```

### Task 5: Durable public newsletter edge

**Files:**
- Create: `packages/saas-contracts/src/storefront/newsletter.ts`
- Create: `packages/saas-contracts/src/storefront/newsletter.test.ts`
- Create: `apps/storefront-shared/lib/newsletter/request.ts`
- Create: `apps/storefront-shared/lib/newsletter/request.test.ts`
- Create: `apps/storefront-shared/lib/newsletter/runtime.ts`
- Create: `apps/storefront-shared/lib/newsletter/runtime.test.ts`
- Create: `apps/storefront-shared/app/api/newsletter/subscriptions/route.ts`
- Create: `apps/storefront-shared/components/NewsletterForm.tsx`
- Create: `apps/storefront-shared/components/NewsletterForm.test.ts`

**Interfaces:**
- Consumes: `NewsletterRepository.subscribe`, exact hostname/runtime config, and footer newsletter projection.
- Produces: `parseNewsletterSubscribeRequest`, `processNewsletterSubscription`, exact public success/error response, and accessible form state.

- [ ] **Step 1: Write failing request/runtime tests**

```ts
test("newsletter accepts only exact consented JSON without private authority", async () => {
  const request = new Request("https://shop.test/api/newsletter/subscriptions", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://shop.test" },
    body: JSON.stringify({ email: "ada@example.test", consent: true }),
  });
  assert.deepEqual(await parseNewsletterSubscribeRequest(request), { email: "ada@example.test", consent: true });
  await assert.rejects(() => parseNewsletterSubscribeRequest(requestWith({ storeId: crypto.randomUUID() })));
});
```

- [ ] **Step 2: Run RED tests**

Run: `node --experimental-transform-types --test apps/storefront-shared/lib/newsletter/*.test.ts`

Expected: FAIL because newsletter request/runtime modules do not exist.

- [ ] **Step 3: Implement exact fail-closed endpoint and form**

```tsx
const response = await fetch("/api/newsletter/subscriptions", {
  method: "POST",
  credentials: "same-origin",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, consent: true }),
});
if (!response.ok) setStatus("Abonelik şu anda tamamlanamadı.");
else setStatus("Aboneliğiniz kaydedildi.");
```

The runtime must use trusted request hostname, never request-body store authority, return `cache-control: no-store`, and expose identical success for initial/repeated subscription.

- [ ] **Step 4: Run GREEN tests/typecheck**

Run: `npm test --workspace @celebix/saas-contracts && npm test --workspace @celebix/storefront-shared && npm run typecheck --workspace @celebix/storefront-shared`

Expected: all newsletter, contract, and storefront tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront apps/storefront-shared/lib/newsletter apps/storefront-shared/app/api/newsletter apps/storefront-shared/components
git commit -m "feat(storefront): capture tenant newsletter consent"
```

### Task 6: Complete product-detail retail experience

**Files:**
- Modify: `apps/storefront-shared/components/ProductDetailExperience.tsx:1-end`
- Modify: `apps/storefront-shared/components/ProductGallery.tsx:1-end`
- Modify: `apps/storefront-shared/components/ProductPurchasePanel.tsx:1-end`
- Create: `apps/storefront-shared/components/ProductInformationDisclosures.tsx`
- Create: `apps/storefront-shared/components/ProductApprovedReviews.tsx`
- Modify: `apps/storefront-shared/components/product-detail-experience.module.css:1-end`
- Modify: `apps/storefront-shared/lib/campaign-page-resolution.ts:1-end`
- Modify/Test: `apps/storefront-shared/components/ProductDetailExperience.test.ts`, `product-gallery-model.test.ts`, and `ProductPurchasePanel.test.ts`

**Interfaces:**
- Consumes: public product merchandising, approved reviews, published policies, related products, canonical variants/cart.
- Produces: reference-led vertical thumbnail gallery, purchase summary, size guide, ordered disclosures, reviews, and responsive sticky purchase.

- [ ] **Step 1: Write failing truthful product-detail tests**

```ts
test("product detail renders only resolved merchandising and policy disclosures", async () => {
  const source = await readFile(detailUrl, "utf8");
  assert.match(source, /ProductInformationDisclosures/);
  assert.match(source, /ProductApprovedReviews/);
  assert.doesNotMatch(source, /Organic cotton|In stock, ready to ship|premium linen/);
});
```

- [ ] **Step 2: Run RED tests**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='product detail|gallery|purchase'`

Expected: FAIL because merchandising/review components are absent.

- [ ] **Step 3: Implement product experience without parallel commerce state**

```tsx
<ProductInformationDisclosures
  order={options.informationSections}
  merchandising={product.merchandising}
  description={product.description}
  policies={policies}
/>
{options.showApprovedReviews && product.reviews.length ? <ProductApprovedReviews reviews={product.reviews} /> : null}
```

Retain `storefrontCartClient.add`, `CartStatusProvider`, real variant selection, buy-now route, safe Markdown, and current related-product authority. Missing size/material/certification data must remove the control.

- [ ] **Step 4: Run GREEN storefront regression**

Run: `npm test --workspace @celebix/storefront-shared && npm run typecheck --workspace @celebix/storefront-shared`

Expected: all product/cart/checkout and storefront tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/components apps/storefront-shared/lib/campaign-page-resolution*
git commit -m "feat(storefront): complete starter product experience"
```

### Task 7: Accessibility, responsive visual fidelity, and security gates

**Files:**
- Create: `tests/saas-phase3/starter-retail-experience/in-process.test.mjs`
- Create: `tests/saas-phase3/starter-retail-experience/browser-acceptance.mjs`
- Modify: focused component CSS/tests only when a measured failure requires it.

**Interfaces:**
- Consumes: complete v3 composer/storefront.
- Produces: automated overflow, focus, reduced-motion, touch-target, contrast, screenshot, and forbidden-source evidence.

- [ ] **Step 1: Add failing acceptance assertions**

```js
for (const viewport of [[1440,1000],[1025,768],[1024,768],[390,844],[320,720]]) {
  await page.setViewportSize({ width: viewport[0], height: viewport[1] });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0);
}
assert.equal(await page.locator('[data-store-utility="cart"]').evaluate((node) => Math.min(node.getBoundingClientRect().width, node.getBoundingClientRect().height) >= 48), true);
```

- [ ] **Step 2: Run acceptance RED against the local build**

Run: `node tests/saas-phase3/starter-retail-experience/in-process.test.mjs`

Expected: any uncovered reference, overflow, focus, or source-scan assertion fails with the exact deficient component.

- [ ] **Step 3: Make only measured CSS/semantic corrections**

Use CSS grid/flex, `min-width: 0`, intrinsic aspect ratios, `:focus-visible`, semantic buttons/details/dialogs, `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }`, and no brittle viewport-specific content duplication.

- [ ] **Step 4: Run complete local matrix GREEN**

Run:

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
npm run build --workspace @celebix/owner
node tests/saas-phase3/starter-retail-experience/postgres-harness.mjs
node --test tests/saas-phase3/starter-retail-experience/static-security.test.mjs
node tests/saas-phase3/starter-retail-experience/in-process.test.mjs
npm run test:saas-phase1
npm run test:saas-phase3:current
git diff --check
```

Expected: all commands PASS, PostgreSQL resources cleaned, `apps/admin/**` diff count 0, and secret/forbidden-ID scans empty.

- [ ] **Step 5: Capture untracked local evidence**

Capture home, navigation, listing, product detail, side cart, footer/newsletter, and empty/partial states at the exact viewport matrix into an untracked evidence directory. Compare each artifact with the nine-item coverage ledger and record measured overflow, target size, contrast, focus, and reduced-motion values.

- [ ] **Step 6: Commit**

```bash
git add tests/saas-phase3/starter-retail-experience apps/storefront-shared apps/customer-panel packages/saas-contracts packages/saas-data apps/owner/scripts/sql/saas
git commit -m "test(storefront): verify complete starter retail experience"
```

### Task 8: Whole-branch review and remote handoff

**Files:**
- No feature files unless review identifies a Critical or Important defect.

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: clean reviewed branch, exact commit map, remote parity, and a deployment-not-executed report.

- [ ] **Step 1: Inspect the complete diff and commit boundaries**

Run: `git diff --stat c6327e60c67a34be59da81a32e012063befd3bbe...HEAD && git log --oneline c6327e60c67a34be59da81a32e012063befd3bbe..HEAD`

Expected: only design/plan, contract, data, SQL, customer-panel, storefront-shared, and focused test files; `apps/admin/**` absent.

- [ ] **Step 2: Run forbidden and secret scans**

```bash
git diff --name-only c6327e60c67a34be59da81a32e012063befd3bbe...HEAD | rg '^apps/admin/' && exit 1 || true
git diff c6327e60c67a34be59da81a32e012063befd3bbe...HEAD | rg -i 'shopify|impulse|tenantId.*(cookie|query|localStorage)|api[_-]?secret|private[_-]?key' && exit 1 || true
```

Expected: no forbidden application source or secrets. Documentation may name the approved visual reference only in its explicit non-copying statement.

- [ ] **Step 3: Repair and re-run any Critical/Important findings**

Every repair must begin with a reproducing failing test, then pass the focused suite and the complete Task 7 matrix. Cosmetic suggestions that do not affect the approved acceptance criteria do not expand scope.

- [ ] **Step 4: Push normally and prove parity**

```bash
git push origin codex/starter-theme-impulse-quality
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/codex/starter-theme-impulse-quality | cut -f1)"
git status --short
```

Expected: local HEAD equals remote SHA and worktree is clean.

- [ ] **Step 5: Report code complete without deployment**

Report the final SHA, commit map, changed files, exact test totals, PostgreSQL result, accessibility/visual evidence paths, `apps/admin/**` diff 0, secret scan, remote parity, deployment 0, production impact 0, and any separately gated staging action.
