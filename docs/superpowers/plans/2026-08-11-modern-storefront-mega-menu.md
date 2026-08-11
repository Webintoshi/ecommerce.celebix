# Modern Storefront Mega Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized single-column desktop category dropdown with a compact, responsive, accessible mega menu while preserving public category authority and the existing mobile drawer.

**Architecture:** Keep `CampaignHeader` as the server-owned navigation renderer. Add only a featured-state data attribute and a dedicated link-grid class, then let the existing CSS module select three columns without featured media and two link columns beside featured media.

**Tech Stack:** Next.js 16, React server components, TypeScript, CSS Modules, Node test runner.

## Global Constraints

- Render only the existing `presentation.navigation` projection.
- Do not change routes, contracts, database state, admin design settings, or publishing authority.
- Keep the mobile drawer unchanged at `1024px` and below.
- Keep every interactive target at least `48px` high and preserve reduced-motion behavior.
- Do not add dependencies or new visible navigation copy.

---

### Task 1: Responsive desktop mega menu

**Files:**
- Modify: `apps/storefront-shared/components/CampaignHeader.test.ts:12-13`
- Modify: `apps/storefront-shared/components/CampaignHeader.tsx:47-69`
- Modify: `apps/storefront-shared/components/campaign-header.module.css:3-9`

**Interfaces:**
- Consumes: `presentation.navigation.items`, each containing `children` and optional `featured`.
- Produces: `.mega[data-featured="true|false"]` and `.megaLinks` layout hooks without changing public URLs.

- [ ] **Step 1: Write the failing layout test**

Add this test to `CampaignHeader.test.ts`:

```ts
test("desktop mega menu fills empty space and keeps featured navigation balanced", async () => {
  const [source, css] = await Promise.all([
    read("CampaignHeader.tsx"),
    read("campaign-header.module.css"),
  ]);
  assert.match(source, /data-featured=\{item[.]featured \? "true" : "false"\}/);
  assert.match(source, /className=\{styles[.]megaLinks\}/);
  assert.match(css, /[.]mega\[data-featured="false"\]\{[^}]*grid-template-columns:1fr/);
  assert.match(css, /[.]mega\[data-featured="false"\] [.]megaLinks\{[^}]*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /[.]megaLinks\{[^}]*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /[.]mega\{[^}]*max-height:min\(70vh,620px\);[^}]*overflow:auto/);
  assert.match(css, /[.]megaLinks>a\{[^}]*min-height:48px/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --experimental-transform-types --test apps/storefront-shared/components/CampaignHeader.test.ts
```

Expected: FAIL because `data-featured`, `.megaLinks`, the adaptive column selectors, and the bounded overflow rule do not exist.

- [ ] **Step 3: Add the minimal semantic layout hooks**

Update the dropdown markup to:

```tsx
<div
  className={styles.mega}
  data-featured={item.featured ? "true" : "false"}
>
  <div className={styles.megaLinks}>
    <strong>{item.name}</strong>
    {item.children.map((child) => (
      <Link href={`/categories/${child.slug}`} key={child.slug}>
        {child.name}
      </Link>
    ))}
  </div>
  {item.featured ? (
    <Link className={styles.featured} href={`/categories/${item.featured.slug}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.featured.image.url}
        alt={item.featured.image.altText}
        width={item.featured.image.width}
        height={item.featured.image.height}
      />
      <span>{item.featured.name}</span>
    </Link>
  ) : null}
</div>
```

- [ ] **Step 4: Implement the adaptive visual system**

Use these exact behavioral rules in `campaign-header.module.css`:

```css
.mega {
  grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
  width: min(calc(100% - 32px), 1120px);
  max-height: min(70vh, 620px);
  overflow: auto;
  gap: 28px;
  padding: 24px;
  border-radius: 16px;
}
.mega[data-featured="false"] { grid-template-columns: 1fr; }
.megaLinks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 6px 12px;
}
.mega[data-featured="false"] .megaLinks {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.megaLinks > strong { grid-column: 1 / -1; }
.megaLinks > a {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 14px;
  border-left: 2px solid transparent;
  border-radius: 10px;
}
.megaLinks > a:hover {
  border-left-color: #9b6d3f;
  background: #f7f4ef;
  transform: translateX(2px);
}
.megaLinks > a:focus-visible {
  border-left-color: #171717;
  outline: 2px solid #171717;
  outline-offset: -2px;
  background: #f7f4ef;
}
.featured {
  overflow: hidden;
  align-self: start;
  border-radius: 14px;
  background: #f4f1ec;
}
.featured span { padding: 0 14px 14px; }
```

Preserve the existing `.megaTrigger:hover .mega`, `.megaTrigger:focus-within .mega`, and reduced-motion selectors unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --experimental-transform-types --test apps/storefront-shared/components/CampaignHeader.test.ts
```

Expected: `10/10 PASS`.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: `420+` tests PASS; typecheck, build, and diff check exit `0`.

- [ ] **Step 7: Verify rendered desktop and mobile behavior**

Open the Güzide staging storefront, capture the dropdown at desktop width and the drawer below `1025px`, then compare with the approved screenshot. Confirm no blank column, no clipping, visible keyboard focus, correct featured media behavior, and unchanged mobile navigation.

- [ ] **Step 8: Commit and push**

```bash
git add apps/storefront-shared/components/CampaignHeader.test.ts apps/storefront-shared/components/CampaignHeader.tsx apps/storefront-shared/components/campaign-header.module.css docs/superpowers/plans/2026-08-11-modern-storefront-mega-menu.md
git commit -m "style(storefront): modernize category mega menu"
git push origin codex/design-tabs-save-fix-live
```
