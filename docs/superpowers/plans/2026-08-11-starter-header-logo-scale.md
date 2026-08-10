# Starter Header Logo Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starter tema header logosunu masaüstünde ve mobilde orantılı biçimde büyütmek.

**Architecture:** Mevcut `CampaignHeader` bileşen sözleşmesi değişmeden kalır. Yalnız CSS ölçüleri güncellenir ve gerçek CSS davranışını doğrulayan test bu sınırı korur.

**Tech Stack:** Next.js, React, CSS Modules, Node test runner

## Global Constraints

- Masaüstü logo: `height:56px`, `max-width:240px`.
- Mobil logo: `height:42px`.
- `width:auto` ve `object-fit:contain` korunur.
- Header grid düzenleri ve mağaza otoritesi değişmez.
- Production, Owner, migration ve altyapı değişikliği yapılmaz.

---

### Task 1: Responsive logo scale

**Files:**
- Modify: `apps/storefront-shared/components/CampaignHeader.test.ts:1-30`
- Modify: `apps/storefront-shared/components/campaign-header.module.css:2-7`

**Interfaces:**
- Consumes: `CampaignHeader` tarafından üretilen `.wordmark img` öğesi.
- Produces: Masaüstünde 56px/240px ve mobilde 42px logo sınırı.

- [ ] **Step 1: Write the failing test**

```ts
test("campaign logo uses the approved larger responsive scale without stretching", async () => {
  const css = await read("campaign-header.module.css");
  assert.match(css, /[.]wordmark img\{[^}]*width:auto;[^}]*max-width:240px;[^}]*height:56px;[^}]*object-fit:contain/);
  assert.match(css, /@media\(max-width:1024px\)\{[^]*[.]wordmark img\{height:42px\}/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @celebix/storefront-shared -- CampaignHeader.test.ts`

Expected: FAIL because the current CSS contains `max-width:200px`, `height:46px`, and mobile `height:38px`.

- [ ] **Step 3: Write minimal implementation**

```css
.wordmark img{display:block;width:auto;max-width:240px;height:56px;object-fit:contain}
@media(max-width:1024px){.wordmark img{height:42px}}
```

- [ ] **Step 4: Run focused and workspace verification**

Run:

```bash
npm test --workspace @celebix/storefront-shared -- CampaignHeader.test.ts
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/components/CampaignHeader.test.ts apps/storefront-shared/components/campaign-header.module.css docs/superpowers/specs/2026-08-11-starter-header-logo-scale-design.md docs/superpowers/plans/2026-08-11-starter-header-logo-scale.md
git commit -m "fix(storefront): enlarge starter header logos"
```
