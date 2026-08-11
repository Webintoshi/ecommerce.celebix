# Policy Workspace and Published Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize fixed policy management and automatically render only published fixed policies in the storefront footer.

**Architecture:** Keep fixed policy definitions and tenant mutation authority unchanged. Add one pure footer projection that merges a body-free public policy index into configured footer groups, then have the server Footer obtain that index from the existing request-cached storefront runtime. Restyle the existing PolicyConsole without introducing a second editor or data source.

**Tech Stack:** Next.js 16 App Router, React 19 server/client components, TypeScript 5.9, CSS Modules, Node test runner, PostgreSQL-backed SaaS repositories.

## Global Constraints

- No database migration or dependency change.
- Policy names, keys, routes, ordering and tenant authority remain fixed and server-owned.
- Draft policy bodies or unpublished links must never reach the public footer.
- Existing optimistic version checks and safe error codes remain unchanged.
- All controls retain 48px interaction targets and reduced-motion support.

---

### Task 1: Published policy footer projection

**Files:**
- Create: `apps/storefront-shared/lib/footer-policies.ts`
- Create: `apps/storefront-shared/lib/footer-policies.test.ts`
- Modify: `apps/storefront-shared/components/Footer.tsx`
- Modify: `apps/storefront-shared/components/RetailFooter.tsx`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts`

**Interfaces:**
- Consumes: `FIXED_STOREFRONT_POLICIES`, `PublicPolicyPage`, `PublicStarterThemePresentationV3["footer"]["groups"]`, `runtime.content.listPolicies({ hostname, now })`.
- Produces: `mergePublishedPolicyFooterGroups(groups, policies)` returning immutable public footer groups in configured order plus one canonical policy group.

- [ ] **Step 1: Write failing pure projection tests**

```ts
test("footer policy projection keeps only published fixed routes in fixed order", () => {
  const result = mergePublishedPolicyFooterGroups(groups, policyIndex);
  assert.deepEqual(result.at(-1)?.links.map(({ destination }) => destination), [
    "/policies/privacy-security",
    "/policies/kvkk",
  ]);
});

test("footer policy projection removes duplicates and preserves non-policy links", () => {
  const result = mergePublishedPolicyFooterGroups(groupsWithDuplicatePolicies, policyIndex);
  assert.equal(JSON.stringify(result).match(/privacy-security/g)?.length, 1);
  assert.equal(result.some((group) => group.links.some((link) => link.destination === "/products")), true);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/lib/footer-policies.test.ts`

Expected: FAIL because `footer-policies.ts` does not exist.

- [ ] **Step 3: Implement the pure immutable projection**

```ts
export function mergePublishedPolicyFooterGroups(
  groups: PublicStarterThemePresentationV3["footer"]["groups"],
  policies: readonly PublicPolicyPage[],
): PublicStarterThemePresentationV3["footer"]["groups"] {
  const fixedRoutes = new Set(FIXED_STOREFRONT_POLICIES.map(({ route }) => route));
  const published = FIXED_STOREFRONT_POLICIES.flatMap((definition) =>
    policies.some((page) => page.key === definition.key && page.published)
      ? [Object.freeze({ label: definition.label, destination: definition.route })]
      : [],
  );
  const cleaned = groups
    .map((group) => Object.freeze({
      heading: group.heading,
      links: Object.freeze(group.links.filter(({ destination }) => !fixedRoutes.has(destination))),
    }))
    .filter((group) => group.links.length > 0 || group.heading === "Politikalar");
  const policyGroupIndex = cleaned.findIndex(({ heading }) => heading === "Politikalar");
  if (published.length === 0)
    return Object.freeze(cleaned.filter(({ heading, links }) => heading !== "Politikalar" || links.length > 0));
  if (policyGroupIndex === -1)
    return Object.freeze([...cleaned, Object.freeze({ heading: "Politikalar", links: Object.freeze(published) })]);
  return Object.freeze(cleaned.map((group, index) => index === policyGroupIndex
    ? Object.freeze({ heading: group.heading, links: Object.freeze([...group.links, ...published]) })
    : group));
}
```

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `node --experimental-transform-types --test apps/storefront-shared/lib/footer-policies.test.ts`

Expected: all footer policy projection tests PASS.

- [ ] **Step 5: Connect the existing body-free policy index to Footer**

```tsx
const resolution = await resolveStorefrontPage();
const policies = resolution.kind === "active" && resolution.context.storefront.hostname === storefront.hostname
  ? await resolution.context.runtime.content.listPolicies({ hostname: storefront.hostname, now: new Date() }).catch(() => Object.freeze([]))
  : Object.freeze([]);
```

Pass the merged groups to both desktop and mobile RetailFooter rendering; apply the same published-only list to the legacy footer.

- [ ] **Step 6: Run storefront focused tests**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test --test-name-pattern="policy|footer" apps/storefront-shared/lib/*.test.ts apps/storefront-shared/components/*.test.ts`

Expected: policy and footer tests PASS with no draft link rendering.

### Task 2: Modern fixed-policy workspace

**Files:**
- Modify: `apps/customer-panel/components/content/PolicyConsole.tsx`
- Modify: `apps/customer-panel/components/content/policy-console.module.css`
- Modify: `apps/customer-panel/components/content/PolicyConsole.test.ts`

**Interfaces:**
- Consumes: existing `storePolicyApi.list/get/save`, `StorePolicyAdminPage`, `PanelStatusBadge`, `ProductDescriptionPreview`.
- Produces: one compact list and one accessible modal editor; no new persistence interface.

- [ ] **Step 1: Strengthen the focused source/contract test**

```ts
assert.match(source, /Yayındaki metinler/);
assert.match(source, /Taslak metinler/);
assert.match(source, /role="radiogroup"/);
assert.match(source, /Markdown önizleme/);
assert.doesNotMatch(source, /Yeni politika|archive|delete|storeId/);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --experimental-transform-types --test apps/customer-panel/components/content/PolicyConsole.test.ts`

Expected: FAIL because the new workspace summary and status control are absent.

- [ ] **Step 3: Implement the compact policy list**

Render a white workspace with published/draft summary values followed by seven fixed rows. Each row contains icon, title, immutable route, update time, status badge and one 48px edit/view action. Preserve the existing `FIXED_STOREFRONT_POLICIES` iteration and missing-record state.

- [ ] **Step 4: Implement the accessible two-pane editor**

Use a centered bounded dialog. Replace the select with two explicit status controls inside `role="radiogroup"`; keep textarea limits, live sanitized preview, optimistic version conflict refresh, Escape/backdrop close, initial focus and focus restoration. Disable publish/save when the body is empty.

- [ ] **Step 5: Implement responsive admin-theme CSS**

Desktop uses a two-pane editor and compact rows. Below 900px the list becomes single-column and the editor panes stack. Header/footer stay visible, body scrolls, orange remains primary-only, and reduced-motion uses `0.01ms`.

- [ ] **Step 6: Run focused test and customer-panel typecheck**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/components/content/PolicyConsole.test.ts
npm run typecheck --workspace @celebix/customer-panel
```

Expected: focused test and typecheck PASS.

### Task 3: Whole-feature verification

**Files:**
- Verify all files changed by Tasks 1-2.

**Interfaces:**
- Consumes: completed admin workspace and footer projection.
- Produces: verified branch-ready implementation with no unrelated file changes.

- [ ] **Step 1: Run workspace tests**

```bash
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
```

Expected: both workspaces PASS.

- [ ] **Step 2: Run typechecks and builds**

```bash
npm run typecheck --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
```

Expected: all four commands PASS.

- [ ] **Step 3: Run static quality checks**

```bash
git diff --check
git status --short
git diff --name-only HEAD
```

Expected: no whitespace errors and only the documented policy/footer files plus approved design/plan docs are changed.

- [ ] **Step 4: Review final behavior**

Confirm published-only fixed ordering, draft hiding, no duplicate policy links, responsive editor, focus restoration, 48px controls, safe failure fallback, and unchanged tenant authority.
