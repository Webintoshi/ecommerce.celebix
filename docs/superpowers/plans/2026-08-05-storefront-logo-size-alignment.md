# Storefront Logo Size and Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable four-level logo sizing and left/center alignment controls to the customer-panel design editor, preview, and published storefront header.

**Architecture:** Extend the existing schema-v2 starter composition and schema-v3 public presentation visual projection with two finite, backward-compatible values. Normalize old records to `medium`/`center`, reuse the existing draft/publish path, and render the published values through finite data attributes and CSS in `CampaignHeader`.

**Tech Stack:** TypeScript, React 19, Next.js 16, Node test runner, CSS Modules, npm workspaces.

## Global Constraints

- Sizes are exactly `small | medium | large | xlarge`.
- Alignments are exactly `left | center`.
- Defaults are exactly `medium` and `center`.
- Existing records remain readable without a database migration.
- Durable published presentation remains the only storefront authority.
- No browser, query, cookie, Host, environment, or tenant-id authority is added.
- `apps/admin/**` remains byte-for-byte unchanged.
- Production deployment and credential mutation remain forbidden.

---

### Task 1: Canonical logo visual contract

**Files:**
- Modify: `packages/saas-contracts/src/storefront/types.ts:11-28`
- Modify: `packages/saas-contracts/src/storefront/validation.ts:10-25,200-224`
- Modify: `packages/saas-contracts/src/storefront/presentation.ts:37-42,78-110`
- Modify: `packages/saas-contracts/src/storefront-design/defaults.ts:3-7`
- Test: `packages/saas-contracts/src/storefront/campaign-starter.test.ts`
- Test: `packages/saas-contracts/src/storefront/storefront.test.ts`

**Interfaces:**
- Produces: `StarterThemeLogoSize = "small" | "medium" | "large" | "xlarge"`.
- Produces: `StarterThemeLogoAlignment = "left" | "center"`.
- Produces: required canonical `StarterThemeVisualV2.logoSize` and `StarterThemeVisualV2.logoAlignment`.
- Consumes: existing `parseStarterThemeCompositionConfig`, `parsePublicStarterThemePresentation`, and presentation adapters.

- [x] **Step 1: Write the failing contract tests**

```ts
const legacyVisual = { ...composition.visual } as Record<string, unknown>;
delete legacyVisual.logoSize;
delete legacyVisual.logoAlignment;
const legacy = parseStarterThemeCompositionConfig({ ...composition, visual: legacyVisual });
assert.equal(legacy.visual.logoSize, "medium");
assert.equal(legacy.visual.logoAlignment, "center");

for (const logoSize of ["small", "medium", "large", "xlarge"] as const) {
  assert.equal(parseStarterThemeCompositionConfig({
    ...composition,
    visual: { ...composition.visual, logoSize, logoAlignment: "left" },
  }).visual.logoSize, logoSize);
}

assert.throws(() => parseStarterThemeCompositionConfig({
  ...composition,
  visual: { ...composition.visual, logoSize: "giant" },
}), /storefront_contract_invalid/);
```

- [x] **Step 2: Run test to verify RED**

Run: `npm test --workspace @celebix/saas-contracts -- storefront/campaign-starter.test.ts storefront/storefront.test.ts`

Expected: FAIL because the canonical logo fields do not exist.

- [x] **Step 3: Implement minimal canonical contract**

```ts
const LOGO_SIZES = Object.freeze(["small", "medium", "large", "xlarge"] as const);
const LOGO_ALIGNMENTS = Object.freeze(["left", "center"] as const);

const parsed = exact(value,
  ["colorScheme", "headingStyle", "cornerStyle", "headerStyle", "productCardStyle", "productImageRatio", "headerWidth", "sectionSpacing"],
  ["logoSize", "logoAlignment"],
);

logoSize: Object.hasOwn(parsed, "logoSize") ? oneOf(parsed.logoSize, LOGO_SIZES) : "medium",
logoAlignment: Object.hasOwn(parsed, "logoAlignment") ? oneOf(parsed.logoAlignment, LOGO_ALIGNMENTS) : "center",
```

Set `logoSize: "medium"` and `logoAlignment: "center"` in default builders and adapters.

- [x] **Step 4: Run focused contract tests and verify GREEN**

Run: `npm test --workspace @celebix/saas-contracts -- storefront/campaign-starter.test.ts storefront/storefront.test.ts`

Expected: PASS with invalid values denied and legacy inputs normalized.

- [x] **Step 5: Commit canonical contract**

```bash
git add packages/saas-contracts/src/storefront/types.ts packages/saas-contracts/src/storefront/validation.ts packages/saas-contracts/src/storefront/presentation.ts packages/saas-contracts/src/storefront-design/defaults.ts packages/saas-contracts/src/storefront/campaign-starter.test.ts packages/saas-contracts/src/storefront/storefront.test.ts
git commit -m "feat(storefront): add canonical logo controls"
```

### Task 2: Customer-panel controls and live preview

**Files:**
- Modify: `apps/customer-panel/components/settings/StarterThemeComposer.tsx:215-226`
- Modify: `apps/customer-panel/components/settings/StarterThemePreview.tsx:75-108`
- Modify: `apps/customer-panel/components/settings/starter-theme-preview.module.css`
- Test: `apps/customer-panel/components/settings/StarterThemeComposer.test.ts`
- Test: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts`

**Interfaces:**
- Consumes: `StarterThemeVisualV2.logoSize` and `.logoAlignment` from Task 1.
- Produces: two controlled selects and preview attributes `data-logo-size` / `data-logo-alignment`.

- [x] **Step 1: Write failing admin/preview tests**

```ts
for (const label of ["Küçük", "Orta", "Büyük", "Çok büyük", "Sola yasla", "Ortala"])
  assert.match(composerSource, new RegExp(label));
assert.match(composerSource, /logoSize: event[.]currentTarget[.]value/);
assert.match(composerSource, /logoAlignment: event[.]currentTarget[.]value/);
assert.match(previewSource, /data-logo-size=\{composition[.]visual[.]logoSize\}/);
assert.match(previewSource, /data-logo-alignment=\{composition[.]visual[.]logoAlignment\}/);
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts`

Expected: FAIL because controls and preview attributes do not exist.

- [x] **Step 3: Implement minimal controls and preview**

```tsx
<label>Logo boyutu<select value={state.visual.logoSize} onChange={(event) => patch({
  visual: { ...state.visual, logoSize: event.currentTarget.value as StarterThemeEditorState["visual"]["logoSize"] },
})}><option value="small">Küçük</option><option value="medium">Orta</option><option value="large">Büyük</option><option value="xlarge">Çok büyük</option></select></label>
<label>Logo hizası<select value={state.visual.logoAlignment} onChange={(event) => patch({
  visual: { ...state.visual, logoAlignment: event.currentTarget.value as StarterThemeEditorState["visual"]["logoAlignment"] },
})}><option value="left">Sola yasla</option><option value="center">Ortala</option></select></label>
```

Set both data attributes on the preview header and map the four heights with CSS. Keep width `auto`, `object-fit: contain`, and a bounded `max-width`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `node --experimental-transform-types --test apps/customer-panel/components/settings/StarterThemeComposer.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts`

Expected: PASS.

- [x] **Step 5: Commit customer-panel controls**

```bash
git add apps/customer-panel/components/settings/StarterThemeComposer.tsx apps/customer-panel/components/settings/StarterThemePreview.tsx apps/customer-panel/components/settings/starter-theme-preview.module.css apps/customer-panel/components/settings/StarterThemeComposer.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts
git commit -m "feat(customer-panel): add logo layout controls"
```

### Task 3: Published storefront header rendering

**Files:**
- Modify: `apps/storefront-shared/components/CampaignHeader.tsx:17-35`
- Modify: `apps/storefront-shared/components/CampaignHeaderClient.tsx:26-41,105-127`
- Modify: `apps/storefront-shared/components/campaign-header.module.css:1-9`
- Test: `apps/storefront-shared/components/CampaignHeader.test.ts`
- Test: `apps/storefront-shared/lib/storefront-app.test.ts`

**Interfaces:**
- Consumes: canonical published `presentation.visual.logoSize` and `.logoAlignment`.
- Produces: finite `data-logo-size` and `data-logo-alignment` on the wordmark.

- [x] **Step 1: Write failing storefront tests**

```ts
assert.match(source, /logoSize=\{presentation[.]visual[.]logoSize\}/);
assert.match(source, /logoAlignment=\{presentation[.]visual[.]logoAlignment\}/);
assert.match(client, /data-logo-size=\{logoSize\}/);
assert.match(client, /data-logo-alignment=\{logoAlignment\}/);
for (const token of ["small", "medium", "large", "xlarge", "left", "center"])
  assert.match(css, new RegExp(token));
```

- [x] **Step 2: Run focused tests and verify RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/CampaignHeader.test.ts apps/storefront-shared/lib/storefront-app.test.ts`

Expected: FAIL because published logo controls are not forwarded or rendered.

- [x] **Step 3: Implement minimal published rendering**

```tsx
<CampaignHeaderClient
  logoSize={presentation.schemaVersion === 3 ? presentation.visual.logoSize : "medium"}
  logoAlignment={presentation.schemaVersion === 3 ? presentation.visual.logoAlignment : "center"}
  {...existingProps}
/>

<Link className={styles.wordmark} data-logo-size={logoSize} data-logo-alignment={logoAlignment} {...existingLinkProps}>
```

```css
.wordmark[data-logo-size="small"] img{height:32px}
.wordmark[data-logo-size="medium"] img{height:46px}
.wordmark[data-logo-size="large"] img{height:60px}
.wordmark[data-logo-size="xlarge"] img{height:76px}
.wordmark[data-logo-alignment="left"]{justify-content:flex-start}
.wordmark[data-logo-alignment="center"]{justify-content:center}
```

Add responsive `max-height`/`max-width` constraints without overriding 48px action targets.

- [x] **Step 4: Run focused tests and verify GREEN**

Run: `node --experimental-transform-types --test apps/storefront-shared/components/CampaignHeader.test.ts apps/storefront-shared/lib/storefront-app.test.ts`

Expected: PASS with finite published authority and no browser authority.

- [x] **Step 5: Commit published rendering**

```bash
git add apps/storefront-shared/components/CampaignHeader.tsx apps/storefront-shared/components/CampaignHeaderClient.tsx apps/storefront-shared/components/campaign-header.module.css apps/storefront-shared/components/CampaignHeader.test.ts apps/storefront-shared/lib/storefront-app.test.ts
git commit -m "feat(storefront): render published logo controls"
```

### Task 4: Whole-branch verification and staging gate

**Files:**
- Verify only; no additional source files.

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: exact commit/push/deploy and browser evidence.

- [x] **Step 1: Run full non-deployment verification**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: every command exits 0.

- [x] **Step 2: Run scope/security checks**

```bash
git diff --name-only b486d18b9a33d62e20e3814580c23ac0493ba703...HEAD -- apps/admin
git diff b486d18b9a33d62e20e3814580c23ac0493ba703...HEAD | rg -n "BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|process[.]env|localStorage|storeId"
```

Expected: `apps/admin` output empty; secret/browser-authority scan has no new match outside intentional negative tests.

- [ ] **Step 3: Push without force**

```bash
git push origin codex/customer-panel-storefront-shortcut
git rev-parse HEAD
git ls-remote origin refs/heads/codex/customer-panel-storefront-shortcut
```

Expected: local and remote SHA match exactly.

- [ ] **Step 4: Deploy isolated staging**

Deploy only customer-panel and storefront staging from the exact pushed SHA. Do not deploy Owner, admin, production, or run migrations.

- [ ] **Step 5: Browser acceptance**

Verify the authenticated admin exposes four Turkish size options and two alignment options, the preview updates immediately, and publish persists the choice. Verify the storefront data attributes match the published selection, the logo is not cropped, horizontal overflow is zero, header actions remain at least 48px, and mobile/desktop layouts remain usable.
