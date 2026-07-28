# Product Markdown and Catalog Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safely rendered Markdown product descriptions and make the product create/list hierarchy compact, equal, honest, responsive, and accessible.

**Architecture:** Keep `Product.description` as the exact persisted source and extend the existing `@celebix/platform-config` rich-text boundary to parse Markdown before allowlist sanitization. Reuse one customer-panel field/preview component in create and edit flows; the existing storefront `ProductFeatures` receives the behavior through the shared normalizer. Replace duplicate list chips with a pure four-metric projection and split bulk controls into explicit action/status groups.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, Node test runner, `markdown-it` 14, existing customer-panel hook renderer, CSS.

## Global Constraints

- Start from `44910169` on `codex/ikas-quality-product-onboarding-implementation`; application base is `98946e504bc8002c9d29e959e7c76155b785117e`.
- Keep the existing 10,000-character `Product.description` source contract and all PostgreSQL/catalog authority unchanged.
- No migration, SQL, Owner, infrastructure, runtime flag, deployment, production access, or credential mutation.
- `apps/admin/**` remains byte-for-byte unchanged.
- Existing plain text and sanitized legacy HTML remain compatible.
- Deny raw Markdown HTML execution, images, unsafe URL schemes, event attributes, executable tags, and unbounded nesting.
- Do not change storefront components; `ProductFeatures` already consumes the shared normalizer.
- Do not change search, filter, refresh, mutation, archive confirmation, pagination, concurrency, or authority behavior.
- Add only direct `markdown-it` and `@types/markdown-it` dependencies; forbid unrelated lockfile churn.
- Follow RED/GREEN TDD for every production behavior.
- Keep interactive controls at least 48px high and horizontal overflow at zero.

---

### Task 1: Shared safe Markdown renderer

**Files:**
- Create: `packages/platform-config/src/product-description-rich-text.test.ts`
- Modify: `packages/platform-config/src/product-description-rich-text.ts:1-242`
- Modify: `packages/platform-config/package.json:1-10`
- Modify: `package-lock.json` through npm only

**Interfaces:**
- Preserve `normalizeProductDescriptionHtml(rawDescription?: string | null, productName?: string): string`.
- Preserve `extractPlainTextFromProductDescription(rawDescription?: string | null, productName?: string): string`.
- Add private `renderMarkdownSource(source: string, productName?: string): string`; only the local sanitizer consumes its output.
- Configure `MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false, maxNesting: 20 })` and disable image output.

- [ ] **Step 1: Write the failing real-behavior tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { extractPlainTextFromProductDescription, normalizeProductDescriptionHtml } from "./product-description-rich-text.ts";

test("renders supported product Markdown through the safe semantic allowlist", () => {
  const html = normalizeProductDescriptionHtml(`# Deri Çanta

**Dayanıklı** ve *hafif*.

- Birinci özellik
- İkinci özellik

| Ölçü | Değer |
| --- | --- |
| En | 30 cm |

~~Eski bilgi~~ ve \`stok kodu\`.`);
  assert.match(html, /<h2>Deri Çanta<\/h2>/);
  assert.match(html, /<strong>Dayanıklı<\/strong>/);
  assert.match(html, /<em>hafif<\/em>/);
  assert.match(html, /<ul>[\s\S]*<li>Birinci özellik<\/li>/);
  assert.match(html, /<table>[\s\S]*<th>Ölçü<\/th>[\s\S]*<td>30 cm<\/td>/);
  assert.match(html, /<del>Eski bilgi<\/del>/);
  assert.match(html, /<code>stok kodu<\/code>/);
});

test("keeps safe links and removes executable authority", () => {
  const links = normalizeProductDescriptionHtml(`[Kılavuz](https://docs.example.com/product?q=1)

[Göreli](/yardim) [Tehlikeli](javascript:alert(1))`);
  const attack = normalizeProductDescriptionHtml('<script>alert("x")</script><img src=x onerror=alert(1)>');
  assert.match(links, /href="https:\/\/docs[.]example[.]com\/product[?]q=1" target="_blank" rel="noopener noreferrer nofollow"/);
  assert.match(links, /href="\/yardim"/);
  assert.doesNotMatch(links, /href="javascript:/i);
  assert.doesNotMatch(attack, /<script|<img|onerror=/i);
});

test("extracts readable plain text without Markdown punctuation", () => {
  const plain = extractPlainTextFromProductDescription("## Başlık\n\n- **Bir**\n- İki\n\n[Detay](/detay)");
  assert.match(plain, /Başlık/);
  assert.match(plain, /• Bir/);
  assert.match(plain, /Detay/);
  assert.doesNotMatch(plain, /##|\*\*|\]\(/);
});

test("preserves plain text and sanitized legacy HTML", () => {
  assert.equal(normalizeProductDescriptionHtml("Sade açıklama"), "<p>Sade açıklama</p>");
  assert.equal(normalizeProductDescriptionHtml('<p>Güvenli <strong>metin</strong></p><script>sil</script>'), "<p>Güvenli <strong>metin</strong></p>");
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test packages/platform-config/src/product-description-rich-text.test.ts`

Expected: assertion FAIL because headings/lists/tables/code are escaped into plain paragraphs. Module-resolution errors are not an acceptable RED.

- [ ] **Step 3: Install only workspace-authorized dependencies**

```bash
npm install markdown-it@^14.1.1 --workspace @celebix/platform-config
npm install --save-dev @types/markdown-it@^14.1.2 --workspace @celebix/platform-config
npm ls markdown-it --workspace @celebix/platform-config
git diff -- packages/platform-config/package.json package-lock.json
```

Expected: two direct dependency declarations and no unrelated version changes.

- [ ] **Step 4: Implement the minimal parser/sanitizer convergence**

```ts
import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: false, maxNesting: 20 });
markdown.renderer.rules.image = (tokens, index) => escapeHtml(tokens[index]?.content ?? "");

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "u", "del", "ul", "ol", "li",
  "h2", "h3", "h4", "blockquote", "a", "pre", "code", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
]);

function renderMarkdownSource(rawDescription: string, productName?: string) {
  return markdown.render(normalizePlainTextDescription(rawDescription, productName));
}
```

Extract current cleanup into `sanitizeProductDescriptionHtml(html, fallbackSource, productName)`. Select `rawDescription` for legacy HTML and `renderMarkdownSource(...)` otherwise; route both through the same dangerous-tag removal, heading normalization, safe-anchor rewrite, allowlist, empty cleanup, and fallback. Extend plain-text extraction with table cell/row boundaries while keeping inline code inline.

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --experimental-transform-types --test packages/platform-config/src/product-description-rich-text.test.ts
npm run typecheck --workspace @celebix/platform-config
git add packages/platform-config/src/product-description-rich-text.ts packages/platform-config/src/product-description-rich-text.test.ts packages/platform-config/package.json package-lock.json
git commit -m "feat(catalog): render safe markdown descriptions"
```

Expected: 4/4 PASS, typecheck PASS, one focused commit.

---

### Task 2: Reusable panel Markdown field and preview

**Files:**
- Create: `apps/customer-panel/components/catalog/ProductDescriptionField.tsx`
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx:1-280`
- Modify: `apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx:1-200`
- Modify: `apps/customer-panel/app/globals.css:205-245`
- Modify: `apps/customer-panel/lib/product-console.test.ts:230-325,688-710`
- Modify: `apps/customer-panel/lib/product-onboarding-console.test.ts:56-65`

**Interfaces:**
- `ProductDescriptionPreview({ source, emptyMessage }: { source?: string | null; emptyMessage?: string }): ReactNode`.
- `ProductDescriptionField({ defaultValue, readOnly, rows, className }: { defaultValue?: string; readOnly?: boolean; rows?: number; className?: string }): ReactNode`.
- Preserve `<textarea name="description" maxLength={10_000}>` and exact source form submission.

- [ ] **Step 1: Add failing integration tests**

```ts
test("create and edit use one safe Markdown description field", async () => {
  const field = await source("components/catalog/ProductDescriptionField.tsx");
  const detail = await source("components/catalog/ProductDetailConsole.tsx");
  const advanced = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");
  assert.match(field, /normalizeProductDescriptionHtml/);
  assert.match(field, /name="description"/);
  assert.match(field, /maxLength=\{10_000\}/);
  assert.match(field, /Markdown desteklenir/);
  assert.match(field, /Markdown önizleme/);
  assert.match(detail, /ProductDescriptionField/);
  assert.match(detail, /ProductDescriptionPreview/);
  assert.match(advanced, /ProductDescriptionField/);
  assert.doesNotMatch(detail, /<p>\{product[.]description/);
});
```

Add a real shared-renderer assertion for source `**Kalın**` -> `<strong>Kalın</strong>` and retain the existing form payload test proving the exact Markdown source is returned unchanged.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts apps/customer-panel/lib/product-onboarding-console.test.ts`

Expected: FAIL because the shared field, preview labels, and integrations do not exist.

- [ ] **Step 3: Implement the reusable field**

```tsx
"use client";
import { useId, useMemo, useState } from "react";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text";

export function ProductDescriptionPreview({ source, emptyMessage = "Önizlemek için açıklama yazın." }: Readonly<{ source?: string | null; emptyMessage?: string }>) {
  const html = useMemo(() => normalizeProductDescriptionHtml(source), [source]);
  return <section className="product-description-preview" aria-label="Markdown önizleme"><strong>Markdown önizleme</strong>{html ? <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: html }} /> : <p>{emptyMessage}</p>}</section>;
}

export function ProductDescriptionField({ defaultValue = "", readOnly = false, rows = 5, className = "" }: Readonly<{ defaultValue?: string; readOnly?: boolean; rows?: number; className?: string }>) {
  const id = useId();
  const [source, setSource] = useState(defaultValue);
  return <div className={`product-description-field ${className}`.trim()}><label htmlFor={id}><span>Açıklama</span><small>Markdown desteklenir</small></label><textarea id={id} name="description" maxLength={10_000} rows={rows} value={source} readOnly={readOnly} onChange={(event) => setSource(event.target.value)} /><ProductDescriptionPreview source={source} /></div>;
}
```

Use `ProductDescriptionField` in detail edit and advanced create. Use `ProductDescriptionPreview` in the read-only summary. Keep payload builders, versioning, and mutation calls unchanged.

- [ ] **Step 4: Add restrained preview CSS**

```css
.product-description-field { display: grid; gap: 8px; }
.product-description-field > label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.product-description-field > label small { color: var(--muted); font-size: 10px; font-weight: 600; }
.product-description-preview { display: grid; gap: 10px; border: 1px solid #e3e8ef; border-radius: 13px; background: #f8fafc; padding: 14px; }
.product-description-rich-text { color: #344054; font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; }
.product-description-rich-text pre { overflow-x: auto; border-radius: 9px; background: #182230; padding: 12px; color: #fff; }
.product-description-rich-text table { width: 100%; border-collapse: collapse; }
.product-description-rich-text th, .product-description-rich-text td { border: 1px solid #d8dee8; padding: 8px; text-align: left; }
```

- [ ] **Step 5: Verify GREEN and commit**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts apps/customer-panel/lib/product-onboarding-console.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git add apps/customer-panel/components/catalog/ProductDescriptionField.tsx apps/customer-panel/components/catalog/ProductDetailConsole.tsx apps/customer-panel/components/catalog-onboarding/ProductAdvancedEditor.tsx apps/customer-panel/app/globals.css apps/customer-panel/lib/product-console.test.ts apps/customer-panel/lib/product-onboarding-console.test.ts
git commit -m "feat(customer-panel): preview product markdown"
```

Expected: focused and workspace tests PASS, typecheck PASS, one focused commit.

---

### Task 3: Compact heading, equal metrics, and aligned bulk controls

**Files:**
- Modify: `apps/customer-panel/components/catalog/ProductCreateForm.tsx:25-33`
- Modify: `apps/customer-panel/components/catalog/ProductListConsole.tsx:77-98,289-294,453-484`
- Modify: `apps/customer-panel/app/globals.css:41-125,307-369`
- Modify: `apps/customer-panel/lib/product-console.test.ts:476-541`

**Interfaces:**
- Replace `productCountLabels` and `storeMetricLabel` with `productSummaryMetrics(state, summary): readonly ProductSummaryMetric[]`.
- `ProductSummaryMetric` fields are `key`, `label`, `value`, and `accessibleValue`; keys are `total`, `active`, `draft`, `out-of-stock`.
- Loading/unavailable values are `—`; accessible values state loading/unavailable instead of borrowing row counts.

- [ ] **Step 1: Write failing metric and mounted-layout tests**

```ts
test("product summary exposes four honest fixed metrics", async () => {
  const production = await productionProductListModule() as { productSummaryMetrics: (state: "loading" | "ready" | "unavailable", summary?: typeof catalogSummary) => readonly { key: string; label: string; value: string; accessibleValue: string }[] };
  assert.deepEqual(production.productSummaryMetrics("ready", catalogSummary), [
    { key: "total", label: "Toplam", value: "2", accessibleValue: "Toplam 2" },
    { key: "active", label: "Aktif", value: "1", accessibleValue: "Aktif 1" },
    { key: "draft", label: "Taslak", value: "1", accessibleValue: "Taslak 1" },
    { key: "out-of-stock", label: "Stoksuz", value: "0", accessibleValue: "Stoksuz 0" },
  ]);
  assert.ok(production.productSummaryMetrics("loading").every(({ value }) => value === "—"));
  assert.ok(production.productSummaryMetrics("unavailable").every(({ accessibleValue }) => /kullanılamıyor/.test(accessibleValue)));
});
```

Add a mounted test asserting four `dt`/`dd` nodes, absence of duplicate metric text, and one list range. Add CSS assertions for `repeat(4, minmax(0, 1fr))`, mobile `repeat(2, minmax(0, 1fr))`, grouped bulk controls, and 48px heights.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts`

Expected: FAIL because the metric projection, semantic `dl/dt/dd`, grouped bulk row, and compact heading are absent.

- [ ] **Step 3: Implement metrics and grouped controls**

Render exactly:

```tsx
<dl className="product-stat-grid" aria-label="Ürün özeti">{metrics.map((metric) => <div key={metric.key} aria-label={metric.accessibleValue}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>
```

Wrap existing left controls in `.product-bulk-actions` and range/row count in `.product-list-status`. Preserve every handler, disabled condition, option value, confirmation, and aria label.

- [ ] **Step 4: Implement compact create heading**

```tsx
<header className="catalog-heading product-create-heading">
  <h1 id="create-title">Yeni ürün oluştur</h1>
  <p>Yalnız ürün adı ve fiyatıyla başlayın; ayrıntıları istediğiniz zaman tamamlayın.</p>
</header>
```

Remove only the redundant `YENİ KAYIT` eyebrow and `hemenaku-form-hero` class. Preserve back link, `aria-labelledby`, route state, and presentation marker.

- [ ] **Step 5: Implement deterministic responsive CSS**

```css
.product-create-heading { gap: 6px; border-bottom: 1px solid #e3e8ef; padding: 4px 0 20px; }
.product-create-heading h1 { font-size: clamp(28px, 3vw, 32px); letter-spacing: -.035em; }
.hemenaku-product-filters { grid-template-columns: minmax(420px, 1fr) minmax(280px, 420px) auto auto; }
.product-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; }
.product-stat-grid > div { display: grid; min-height: 56px; align-content: center; gap: 2px; border: 1px solid #dde4ed; border-radius: 12px; background: #fff; padding: 8px 12px; }
.product-bulkbar { justify-content: space-between; }
.product-bulk-actions, .product-list-status { display: flex; align-items: center; gap: 10px; }
.product-bulk-actions > select, .product-bulk-actions > button, .select-all-control, .row-count-control { min-height: 48px; }
```

At 980px put metric grid across all columns. At 640px use 2x2 metrics, full-width search, wrapping bulk groups, and hide only row count. Do not add horizontal scrolling to the controls.

- [ ] **Step 6: Verify GREEN, build, and commit**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
git add apps/customer-panel/components/catalog/ProductCreateForm.tsx apps/customer-panel/components/catalog/ProductListConsole.tsx apps/customer-panel/app/globals.css apps/customer-panel/lib/product-console.test.ts
git commit -m "fix(customer-panel): balance product controls"
```

Expected: focused/full tests, typecheck, and build PASS; one focused commit.

---

### Task 4: Whole-surface regression and browser acceptance

**Files:**
- Modify only after a new failing regression: files already listed in Tasks 1–3
- Do not create tracked screenshots or temporary artifacts

**Interfaces:**
- Browser acceptance uses the existing local customer-panel test/session fixture.
- No deploy, database mutation, credential creation, or production request.

- [ ] **Step 1: Run full local gates**

```bash
npm run typecheck --workspace @celebix/platform-config
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-base
npm run build --workspace @celebix/storefront-base
npm run test:saas-phase3:current
git diff --check
```

Expected: every command PASS; record fresh customer-panel and Phase 3 totals.

- [ ] **Step 2: Verify scope, dependency churn, and security**

```bash
git diff --name-only 98946e504bc8002c9d29e959e7c76155b785117e...HEAD
git diff --name-only 98946e504bc8002c9d29e959e7c76155b785117e...HEAD -- apps/admin
git diff 98946e504bc8002c9d29e959e7c76155b785117e...HEAD -- package-lock.json packages/platform-config/package.json
git diff 98946e504bc8002c9d29e959e7c76155b785117e...HEAD | rg -n '(document[.]cookie|localStorage|sessionStorage|tenantId|storeId|SUPABASE|DATABASE_URL|PRIVATE_KEY)' || true
```

Expected: `apps/admin/**` diff count 0, no unrelated dependency churn, browser authority, or secret. Attack strings may exist only in the dedicated negative test fixture.

- [ ] **Step 3: Verify `/products`, `/products/new`, and a product detail locally in Browser/IAB**

Check 1440x900, 1024x768, 640x844, and 390x844. At each viewport evaluate:

```js
({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  metricCount: document.querySelectorAll(".product-stat-grid dt").length,
  minControlHeight: Math.min(...[...document.querySelectorAll(".product-bulkbar button, .product-bulkbar select, .select-all-control")].map((node) => node.getBoundingClientRect().height)),
})
```

Expected: overflow 0, metricCount 4 on list, minControlHeight >= 48, desktop metrics one row, mobile metrics 2x2, compact heading, no clipping, and no console errors.

- [ ] **Step 4: Verify Markdown interaction without durable staging mutation**

Use this exact source in the local field:

```markdown
## Malzeme

- **Hakiki deri**
- Suya dayanıklı

[Bakım rehberi](https://example.com/bakim)
```

Expected: textarea source remains byte-for-byte identical; preview shows heading/list/strong/link without punctuation; no raw HTML executes. Storefront equivalence is covered by the shared normalizer and storefront build, without changing storefront files.

- [ ] **Step 5: Final verification-before-completion**

If browser QA exposes a defect, first add a failing regression in the relevant existing test, observe RED, apply the minimal in-scope fix, rerun all affected gates, and commit `fix(customer-panel): finish product markdown layout`. Otherwise create no empty commit.

```bash
git status --short
git log --oneline 98946e504bc8002c9d29e959e7c76155b785117e..HEAD
git rev-parse HEAD
```

Expected: clean worktree, final HEAD differs from `44910169`, deployment 0, production impact 0.
