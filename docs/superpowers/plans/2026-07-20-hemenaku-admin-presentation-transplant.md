# Hemenaku Admin Presentation Transplant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/customer-panel` içindeki mevcut gerçek session, `TenantContext`, catalog ve media yetkilerini değiştirmeden Hemenaku admin donor'ının kabuk, dashboard ve ürün yönetimi sunumunu ölçülebilir şekilde hedef uygulamaya taşımak.

**Architecture:** Presentation-only kod pinned donor commit'inden küçük hedef bileşenlere adapte edilir; donor auth/data/runtime kodu hiçbir zaman import edilmez. Server yalnız frozen `PanelChromeModel` üretir, client yalnız güvenli display model ve same-origin catalog/media command port'larını tüketir. Gerçek authority bulunmayan commerce alanları sayısal veri, link veya mutation üretmeden açık `unsupported` yüzey olarak kalır.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, CSS Modules/global design tokens, `lucide-react`, `framer-motion`, `recharts`, Node test runner.

## Global Constraints

- Uygulama branch'i exact `6563a1428434e1974f50af3ffb843eb4067f686a` tabanından `codex/hemenaku-admin-presentation-transplant-implementation` olarak oluşturulur; documentation branch application base olamaz.
- Donor exact `fc6c5318b47f045a7cefcedc7612d5b10563ba32` olarak pinlenir; `apps/admin/**` byte-for-byte read-only kalır.
- Hedef yalnız `apps/customer-panel`; yeni admin uygulaması, iframe, reverse proxy veya `apps/admin-shared` yoktur.
- Authority zinciri değişmez: `__Host-celebix_panel` → durable PostgreSQL session → `TenantContext`.
- Full `TenantContext`, principal/store/membership/domain/plan ID'leri, issuer, subject, cookie ve token client component'lere geçmez.
- Supabase, legacy admin Logto, `STORE_RUNTIME`, `store-info-context`, `/api/admin/**` ve browser tenant/store authority import edilmez.
- Gerçek shared authority'si olmayan özellik için sahte KPI, örnek kayıt, dead link veya çalışıyormuş gibi mutation oluşturulmaz.
- Navigation yalnız `/`, `/products`, `/products/new`, `/products/[productId]` ve `/setup` working surface'lerini temsil eder.
- Direct runtime dependency değişikliği yalnız `framer-motion@^12.29.0` ve `recharts@^3.7.0`; lockfile'da ilgisiz churn yasaktır.
- Mevcut catalog/media endpoint, payload, error, version-conflict ve same-origin credential davranışları değişmez.
- Staging deploy ayrı yetki kapısıdır; bu planın lokal code-complete yürütmesinde deploy `0`, production etkisi `0` kalır.
- Her task RED → GREEN → REFACTOR, implementer review, spec review ve quality review sonrasında bağımsız commit olur; amend/squash yoktur.

## Baseline and Known Preconditions

- `npm test --workspace @celebix/customer-panel`: `112/112 PASS`.
- `node --experimental-transform-types --test tests/saas-phase3/hemenaku-merchant-shell/*.test.mjs`: `13/13 PASS`.
- Catalog/media UI static regression: `13/13 PASS`.
- Documentation branch'inde eski Phase 3 allowlist testi yeni spec dosyasını tanımadığı için birleşik shell/dashboard komutu `16/17`; implementation branch exact `6563a142...` tabanından açıldığında docs diff'i bulunmayacağından bu sapma yoktur.
- Owner'ın tüm `apps/owner/lib/**/*.test.ts` dosyalarını Node 24 ile tek seferde çağıran ad-hoc komut, bu görevden önce var olan extensionless importlar nedeniyle `263/268 PASS, 5 FAIL` verir. Bu görev Owner dosyası değiştirmez; Owner regression gate typecheck/build ve before/after aynı 5-failure fingerprint'idir.

---

### Task 1: Isolated Implementation Branch, Donor Proof, and Exact Dependencies

**Files:**
- Create: `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs`
- Modify: `apps/customer-panel/package.json:13-22`
- Modify: `package-lock.json` (npm-generated workspace entry only)

**Interfaces:**
- Consumes: exact base SHA `6563a1428434e1974f50af3ffb843eb4067f686a`; donor SHA `fc6c5318b47f045a7cefcedc7612d5b10563ba32`.
- Produces: implementation branch plus direct `framer-motion` and `recharts` imports available to later client components.

- [ ] **Step 1: Create and verify the isolated branch**

Run:

```bash
git fetch origin --prune
test "$(git rev-parse origin/codex/shared-merchant-admin-catalog-dashboard)" = "6563a1428434e1974f50af3ffb843eb4067f686a"
git checkout -B codex/hemenaku-admin-presentation-transplant-implementation 6563a1428434e1974f50af3ffb843eb4067f686a
test "$(git rev-parse fc6c5318b47f045a7cefcedc7612d5b10563ba32^{commit})" = "fc6c5318b47f045a7cefcedc7612d5b10563ba32"
test -z "$(git diff --name-only 6563a1428434e1974f50af3ffb843eb4067f686a...HEAD -- apps/admin)"
```

Expected: every command exits `0`; HEAD equals the implementation base; `apps/admin` output is empty.

- [ ] **Step 2: Write the failing provenance/dependency security test**

Create the test with these complete assertions:

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "6563a1428434e1974f50af3ffb843eb4067f686a";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const read = (path) => readFile(new URL(path, ROOT), "utf8");

test("pins the donor and leaves apps admin byte unchanged", () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(git("diff", "--name-only", `${BASE}...HEAD`, "--", "apps/admin"), "");
});

test("declares only the approved presentation dependencies", async () => {
  const pkg = JSON.parse(await read("apps/customer-panel/package.json"));
  assert.equal(pkg.dependencies["framer-motion"], "^12.29.0");
  assert.equal(pkg.dependencies.recharts, "^3.7.0");
  assert.equal(pkg.dependencies.sonner, undefined);
  assert.equal(pkg.dependencies["@supabase/ssr"], undefined);
  assert.equal(pkg.dependencies["@supabase/supabase-js"], undefined);
});

test("keeps production deploy infrastructure and donor outside the diff", () => {
  const changed = git("diff", "--name-only", `${BASE}...HEAD`).split("\n").filter(Boolean);
  assert.equal(changed.some((path) => /^(apps\/admin|apps\/owner|deploy|infra|infrastructure)\//.test(path)), false);
});
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
node --test tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
```

Expected: `2/3 PASS, 1/3 FAIL`; missing `framer-motion` and `recharts` direct dependencies cause only the dependency assertion to fail.

- [ ] **Step 4: Install only the approved workspace dependencies**

Run:

```bash
npm install framer-motion@^12.29.0 recharts@^3.7.0 --workspace @celebix/customer-panel
npm ls framer-motion recharts --workspace @celebix/customer-panel --depth=0
git diff -- package-lock.json apps/customer-panel/package.json
```

Expected: direct versions resolve to existing lock graph-compatible releases; no unrelated package version changes appear.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
node --test tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
git diff --check
git add apps/customer-panel/package.json package-lock.json tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
git commit -m "build(customer-panel): pin hemenaku presentation dependencies"
```

Expected: `3/3 PASS`; one commit with exactly three changed paths.

---

### Task 2: Immutable Presentation Authority and Navigation Contracts

**Files:**
- Create: `apps/customer-panel/lib/panel-ui/authority-slice.ts`
- Create: `apps/customer-panel/lib/panel-ui/authority-slice.test.ts`
- Modify: `apps/customer-panel/lib/panel-ui/chrome-model.ts:3-68`
- Modify: `apps/customer-panel/lib/panel-ui/chrome-model.test.ts:44-129`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts:1-83`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts:11-79`

**Interfaces:**
- Consumes: server-produced `PanelChromeModel`; existing exact route set.
- Produces: `AuthoritySlice<T>`, `readyAuthority`, `emptyAuthority`, `unavailableAuthority`, `unsupportedAuthority`; frozen donor-compatible navigation presentation without new href authority.

- [ ] **Step 1: Write failing `AuthoritySlice` tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyAuthority,
  readyAuthority,
  unavailableAuthority,
  unsupportedAuthority,
} from "./authority-slice.ts";

test("freezes every authority slice and ready payload", () => {
  const ready = readyAuthority({ total: 3 }, "2026-07-20T12:00:00.000Z");
  assert.deepEqual(ready, { state: "ready", value: { total: 3 }, asOf: "2026-07-20T12:00:00.000Z" });
  assert.equal(Object.isFrozen(ready), true);
  assert.equal(Object.isFrozen(ready.value), true);
});

test("represents absence without fabricated numeric values", () => {
  assert.deepEqual(emptyAuthority("Kayıt bulunmuyor"), { state: "empty", message: "Kayıt bulunmuyor" });
  assert.deepEqual(unavailableAuthority(false), { state: "unavailable", retryable: false });
  assert.deepEqual(unsupportedAuthority("orders"), { state: "unsupported", capability: "orders" });
});
```

- [ ] **Step 2: Extend chrome/navigation negative tests**

Add exactly these two top-level tests to each existing test file:

```ts
test("chrome projection contains no enumerable authority graph", () => {
  const model = createPanelChromeModel(CONTEXT);
  assert.deepEqual(Object.keys(model).sort(), [
    "entitlementStatus", "locale", "membershipLabel", "planCode",
    "planVersion", "storeSlug", "storefrontHostname",
  ]);
});

test("chrome rejects prototype and malformed hostname authority", () => {
  const inherited = Object.create(CONTEXT);
  assert.throws(() => createPanelChromeModel(inherited), /panel_chrome_context_invalid/);
  const ported = { ...CONTEXT, resolvedHost: { ...CONTEXT.resolvedHost!, canonicalHostname: "atlas-store.celebix.site:443" } };
  assert.throws(() => createPanelChromeModel(ported as TenantContext), /panel_chrome_context_invalid/);
});
```

```ts
test("navigation never activates a query fragment or encoded near match", () => {
  for (const pathname of ["/products?next=/products", "/products#x", "/products%2Fevil", "/products//evil"]) {
    assert.equal(isPanelNavigationPathActive(pathname, "/products"), false);
  }
});

test("navigation exposes no disabled donor destination", () => {
  const hrefs = JSON.stringify(PANEL_NAVIGATION);
  assert.doesNotMatch(hrefs, /admin|orders|customers|analytics|marketing|discount|settings/i);
});
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/authority-slice.test.ts apps/customer-panel/lib/panel-ui/chrome-model.test.ts apps/customer-panel/lib/panel-ui/navigation.test.ts
```

Expected: new module import fails; after the module exists but before validation changes, inherited context and query/fragment path assertions fail.

- [ ] **Step 4: Implement the immutable authority slice and exact pathname guard**

Create `authority-slice.ts` with this complete API:

```ts
export type AuthoritySlice<T extends object> =
  | Readonly<{ state: "ready"; value: Readonly<T>; asOf: string }>
  | Readonly<{ state: "empty"; message: string }>
  | Readonly<{ state: "locked"; feature: string }>
  | Readonly<{ state: "unavailable"; retryable: boolean }>
  | Readonly<{ state: "unsupported"; capability: string }>;

const text = (value: string) => {
  if (!value || value !== value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("panel_authority_slice_invalid");
  }
  return value;
};

export function readyAuthority<T extends object>(value: T, asOf: string): AuthoritySlice<T> {
  if (!Number.isFinite(Date.parse(asOf))) throw new Error("panel_authority_slice_invalid");
  return Object.freeze({ state: "ready" as const, value: Object.freeze({ ...value }), asOf });
}
export const emptyAuthority = (message: string): AuthoritySlice<never> =>
  Object.freeze({ state: "empty", message: text(message) });
export const unavailableAuthority = (retryable: boolean): AuthoritySlice<never> =>
  Object.freeze({ state: "unavailable", retryable });
export const unsupportedAuthority = (capability: string): AuthoritySlice<never> =>
  Object.freeze({ state: "unsupported", capability: text(capability) });
```

At the first line of `createPanelChromeModel`, reject non-own graph fields:

```ts
if (!context || Object.getPrototypeOf(context) !== Object.prototype) invalid();
```

At the start of `isPanelNavigationPathActive`, require a pathname-only canonical input:

```ts
if (!pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#") || pathname.includes("%") || pathname.includes("//")) {
  return false;
}
```

- [ ] **Step 5: Run GREEN and full workspace regression**

Run:

```bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Expected: `118/118 PASS`; typecheck exits `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/panel-ui/authority-slice.ts apps/customer-panel/lib/panel-ui/authority-slice.test.ts apps/customer-panel/lib/panel-ui/chrome-model.ts apps/customer-panel/lib/panel-ui/chrome-model.test.ts apps/customer-panel/lib/panel-ui/navigation.ts apps/customer-panel/lib/panel-ui/navigation.test.ts
git commit -m "test(customer-panel): harden presentation authority"
```

---

### Task 3: Exact Brand Tokens, Logo, and Page Primitives

**Files:**
- Create: `apps/customer-panel/public/Logo/celebix-beyaz-logo.svg`
- Modify: `apps/customer-panel/app/globals.css:1-39`
- Modify: `apps/customer-panel/components/panel/PanelPageShell.tsx:1-64`
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css:1-end`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs`

**Interfaces:**
- Consumes: donor `apps/admin/app/globals.css:1-745`, donor logo blob, donor `AdminPageShell.tsx:1-392`.
- Produces: reusable target primitives with no donor runtime import: `PanelPageShell`, `PanelPageHeader`, `PanelPanel`, `PanelToolbar`, `PanelBadge`, `PanelStatusBadge`, `PanelMetricCard`, `PanelDataTable`, `PanelLoadingState`, `PanelActionButton`, `PanelEmptyState`, `PanelSkeletonBlock`.

- [ ] **Step 1: Add failing donor-token/asset/primitive assertions**

Append to the presentation security test:

```js
test("ports the exact donor brand asset and core visual tokens", async () => {
  const donorLogo = git("show", `${DONOR}:apps/admin/public/Logo/celebix-beyaz-logo.svg`);
  const targetLogo = (await read("apps/customer-panel/public/Logo/celebix-beyaz-logo.svg")).trim();
  assert.equal(targetLogo, donorLogo);
  const css = await read("apps/customer-panel/app/globals.css");
  assert.match(css, /--hemenaku-orange:\s*#FF6A00/i);
  assert.match(css, /--hemenaku-sidebar:\s*#2A2A2A/i);
  assert.match(css, /--panel-touch-target:\s*48px/i);
});

test("exports the complete donor-compatible page primitive set", async () => {
  const source = await read("apps/customer-panel/components/panel/PanelPageShell.tsx");
  for (const name of ["PanelPageShell", "PanelPageHeader", "PanelPanel", "PanelToolbar", "PanelBadge", "PanelStatusBadge", "PanelMetricCard", "PanelDataTable", "PanelLoadingState", "PanelActionButton", "PanelEmptyState", "PanelSkeletonBlock"]) {
    assert.match(source, new RegExp(`export function ${name}\\b`));
  }
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
```

Expected: `3/5 PASS, 2/5 FAIL` because the target logo and `PanelSkeletonBlock` do not exist.

- [ ] **Step 3: Port the exact SVG and minimal presentation primitive**

Read the donor asset with `git show`, then add its exact bytes through `apply_patch`. Add this primitive:

```tsx
export function PanelSkeletonBlock({ className }: { className?: string }) {
  return <span className={`${styles.skeletonBlock} ${className ?? ""}`} aria-hidden="true" />;
}
```

Port only donor token/reset/page-primitive declarations that are consumed by target components. Keep target auth page and existing catalog selectors intact. Required token values are:

```css
:root {
  --hemenaku-orange: #FF6A00;
  --hemenaku-orange-dark: #E85D04;
  --hemenaku-canvas: #F9F9F9;
  --hemenaku-sidebar: #2A2A2A;
  --panel-touch-target: 48px;
}
.skeletonBlock {
  display: block;
  min-height: 1rem;
  border-radius: .75rem;
  background: linear-gradient(90deg, #eceff3 25%, #f7f8fa 50%, #eceff3 75%);
  background-size: 200% 100%;
  animation: panelSkeleton 1.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeletonBlock { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
node --test tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/public/Logo/celebix-beyaz-logo.svg apps/customer-panel/app/globals.css apps/customer-panel/components/panel/PanelPageShell.tsx apps/customer-panel/components/panel/panel-shell.module.css tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
git commit -m "feat(customer-panel): port hemenaku presentation primitives"
```

Expected: `5/5 PASS`; typecheck and diff check exit `0`.

---

### Task 4: Desktop Shell, Mobile Drawer, and Dock

**Files:**
- Modify: `apps/customer-panel/components/panel/PanelLayoutClient.tsx:1-146`
- Modify: `apps/customer-panel/components/panel/PanelSidebar.tsx:1-148`
- Modify: `apps/customer-panel/components/panel/PanelNavigation.tsx:1-76`
- Modify: `apps/customer-panel/components/panel/PanelMobileDock.tsx:1-45`
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css:1-end`
- Modify: `tests/saas-phase3/hemenaku-merchant-shell/static-security.test.mjs:12-72`
- Modify: `tests/saas-phase3/hemenaku-merchant-shell/in-process.test.mjs:22-54`

**Interfaces:**
- Consumes: frozen `PanelChromeModel`, exact `PANEL_NAVIGATION`, same-origin `LogoutButton`; donor `AdminLayoutClient.tsx:1-649` and `AdminSidebar.tsx:1-997` presentation only.
- Produces: 1025px+ desktop chrome; ≤1024px drawer/dock; Escape/backdrop/close/swipe close paths and focus restoration.

- [ ] **Step 1: Strengthen shell tests before markup changes**

Add assertions proving the contract rather than class-name presence:

```js
test("shell breakpoint and accessibility controls are exact", async () => {
  const layout = await read("apps/customer-panel/components/panel/PanelLayoutClient.tsx");
  const sidebar = await read("apps/customer-panel/components/panel/PanelSidebar.tsx");
  const dock = await read("apps/customer-panel/components/panel/PanelMobileDock.tsx");
  const css = await read("apps/customer-panel/components/panel/panel-shell.module.css");
  assert.match(layout, /matchMedia\(["']\(min-width: 1025px\)["']\)/);
  assert.match(sidebar, /event\.key === "Escape"/);
  assert.match(sidebar, /aria-modal="true"/);
  assert.match(sidebar, /touchCurrent\.current - touchStart\.current >= 64/);
  assert.match(dock, /aria-controls="panel-mobile-drawer"/);
  assert.match(css, /@media\s*\(min-width:\s*1025px\)/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /--panel-keyboard-inset/);
});
```

Update the existing dependency assertion to require exactly `lucide-react`, `framer-motion`, and `recharts`, while continuing to reject donor auth packages.

- [ ] **Step 2: Run tests and capture RED caused by missing donor logo/motion composition**

Run:

```bash
node --experimental-transform-types --test tests/saas-phase3/hemenaku-merchant-shell/*.test.mjs
```

Expected: the new exact-logo and motion assertions fail; authority, navigation and logout tests remain green.

- [ ] **Step 3: Port shell presentation without donor authority**

Use the exact target logo and keep model-only props:

```tsx
function PanelBrand({ onClick }: { onClick?: () => void }) {
  return (
    <Link className={styles.brand} href="/" aria-label="Celebix Panel ana sayfa" onClick={onClick}>
      <Image src="/Logo/celebix-beyaz-logo.svg" width={126} height={34} alt="Celebix" priority />
    </Link>
  );
}
```

Wrap only drawer presentation in `framer-motion`; keep close authority in existing callbacks:

```tsx
<AnimatePresence onExitComplete={onRestoreFocus}>
  {open ? (
    <>
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.drawerBackdrop} type="button" aria-label="Panel menüsünü kapat" onClick={onClose} />
      <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 0.2 }} id="panel-mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobil panel menüsü">...</motion.aside>
    </>
  ) : null}
</AnimatePresence>
```

Do not port notifications, Toshi, profile fetch, permission checks, store runtime or donor hrefs. Preserve the existing focus trap, 64px swipe threshold, body scroll lock, visual viewport keyboard inset and same-origin logout.

- [ ] **Step 4: Complete CSS geometry**

Required measurable CSS:

```css
.desktopSidebar { width: 15rem; background: #2A2A2A; }
.workspace { margin-left: 15rem; }
.mobileDock, .drawerSurface, .drawerBackdrop { display: none; }
@media (max-width: 1024px) {
  .desktopSidebar, .desktopTopbar { display: none; }
  .workspace { margin-left: 0; padding-bottom: calc(5.25rem + env(safe-area-inset-bottom) + var(--panel-keyboard-inset, 0px)); }
  .mobileDock, .drawerSurface, .drawerBackdrop { display: flex; }
}
@media (min-width: 1025px) {
  .desktopSidebar, .desktopTopbar { display: flex; }
}
@media (prefers-reduced-motion: reduce) {
  .drawerSurface, .drawerBackdrop, .navigationLink { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
```

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
node --experimental-transform-types --test tests/saas-phase3/hemenaku-merchant-shell/*.test.mjs
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/components/panel tests/saas-phase3/hemenaku-merchant-shell
git commit -m "feat(customer-panel): transplant hemenaku responsive shell"
```

Expected: shell suite `14/14 PASS`; workspace `118/118 PASS`; typecheck exits `0`.

---

### Task 5: Truthful Donor Dashboard Geometry

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.ts:1-107`
- Modify: `apps/customer-panel/lib/panel-ui/dashboard-model.test.ts:1-84`
- Modify: `apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx:1-114`
- Modify: `apps/customer-panel/components/dashboard/panel-dashboard.module.css:1-86`
- Modify: `tests/saas-phase3/shared-merchant-catalog-dashboard/in-process.test.mjs:1-44`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs`

**Interfaces:**
- Consumes: `PanelChromeModel`, `AuthoritySlice<CatalogDashboardSummary>`, `catalogApi.getDashboardSummary()`.
- Produces: `MerchantDashboardViewModel`, exact five truthful catalog metrics, catalog chart points and unsupported slices for orders/analytics/customers/carts. Existing `createPanelDashboardModel` export and its legacy-safe projection remain source-compatible.

- [ ] **Step 1: Write four failing dashboard model tests**

Add tests for ready, unavailable, unsupported and no-private-authority behavior:

```ts
test("maps five exact catalog metrics and chart points from durable summary", () => {
  const model = createMerchantDashboardViewModel(chrome, readyAuthority(summary, "2026-07-20T12:00:00.000Z"));
  assert.deepEqual(model.catalog.state === "ready" ? model.catalog.value.metrics.map(({ key, value }) => [key, value]) : [], [
    ["products", 4], ["active-products", 3], ["draft-products", 1], ["out-of-stock", 2], ["active-media", 7],
  ]);
});

test("marks absent commerce domains unsupported without zero KPI", () => {
  const model = createMerchantDashboardViewModel(chrome, unavailableAuthority(true));
  assert.deepEqual([model.orders.state, model.analytics.state, model.customers.state, model.carts.state], ["unsupported", "unsupported", "unsupported", "unsupported"]);
  assert.doesNotMatch(JSON.stringify(model), /revenue|conversion|orderTotal|customerTotal|0 ₺/i);
});

test("keeps dashboard slices deeply frozen", () => {
  const model = createMerchantDashboardViewModel(chrome, readyAuthority(summary, "2026-07-20T12:00:00.000Z"));
  assert.equal(Object.isFrozen(model), true);
  assert.equal(model.catalog.state === "ready" && Object.isFrozen(model.catalog.value.metrics), true);
});

test("maps catalog failure to controlled retry state", () => {
  const model = createMerchantDashboardViewModel(chrome, unavailableAuthority(true));
  assert.deepEqual(model.catalog, { state: "unavailable", retryable: true });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/dashboard-model.test.ts tests/saas-phase3/shared-merchant-catalog-dashboard/in-process.test.mjs
```

Expected: FAIL because `createMerchantDashboardViewModel` and five-metric view model do not exist.

- [ ] **Step 3: Implement the complete dashboard contract**

```ts
export interface CatalogMetric {
  readonly key: "products" | "active-products" | "draft-products" | "out-of-stock" | "active-media";
  readonly label: string;
  readonly value: number;
  readonly detail: string;
}
export interface CatalogDashboardViewModel {
  readonly metrics: readonly CatalogMetric[];
  readonly chart: readonly Readonly<{ label: string; value: number }>[];
  readonly productsWithoutMedia: number;
  readonly productLimit: number;
}
export interface MerchantDashboardViewModel {
  readonly title: "Genel bakış";
  readonly description: string;
  readonly chromeCards: readonly PanelDashboardCard[];
  readonly catalog: AuthoritySlice<CatalogDashboardViewModel>;
  readonly orders: AuthoritySlice<never>;
  readonly analytics: AuthoritySlice<never>;
  readonly customers: AuthoritySlice<never>;
  readonly carts: AuthoritySlice<never>;
  readonly actions: readonly PanelDashboardAction[];
}
```

`createMerchantDashboardViewModel` must reuse `createPanelDashboardModel` for the existing chrome cards/actions, copy only numeric catalog summary fields, deep-freeze arrays/items, and use `unsupportedAuthority("orders")`, `unsupportedAuthority("analytics")`, `unsupportedAuthority("customers")`, `unsupportedAuthority("carts")`. Do not remove or rename `createPanelDashboardModel`; its current callers and output contract remain unchanged.

- [ ] **Step 4: Adapt donor dashboard presentation**

Use donor `DashboardHomeView.tsx:480-973` geometry but replace sales data with the five real catalog metrics. Recharts receives only these points:

```tsx
<ResponsiveContainer width="100%" height={280}>
  <BarChart data={dashboard.catalog.value.chart} accessibilityLayer>
    <CartesianGrid strokeDasharray="3 3" vertical={false} />
    <XAxis dataKey="label" />
    <YAxis allowDecimals={false} />
    <Tooltip formatter={(value) => [String(value), "Katalog"]} />
    <Bar dataKey="value" fill="#FF6A00" radius={[8, 8, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

Render period/channel controls disabled with `aria-disabled="true"`; render donor lower-panel geometry as explicit unsupported copy with no link and no numeric value. Loading shows skeletons, `unavailable` shows one retry button, and ready shows exact summary.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
npm test --workspace @celebix/customer-panel
node --experimental-transform-types --test tests/saas-phase3/shared-merchant-catalog-dashboard/in-process.test.mjs tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/lib/panel-ui/dashboard-model.ts apps/customer-panel/lib/panel-ui/dashboard-model.test.ts apps/customer-panel/components/dashboard tests/saas-phase3/shared-merchant-catalog-dashboard/in-process.test.mjs tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
git commit -m "feat(customer-panel): render truthful hemenaku dashboard"
```

Expected: workspace `122/122 PASS`; selected Phase 3 tests `6/6 PASS`; typecheck exits `0`.

---

### Task 6: Product List Presentation Transplant

**Files:**
- Modify: `apps/customer-panel/components/catalog/ProductListConsole.tsx:1-157`
- Modify: `apps/customer-panel/app/globals.css:41-127,233-279`
- Modify: `apps/customer-panel/lib/product-console.test.ts:60-120`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs`

**Interfaces:**
- Consumes: existing `catalogApi.listProducts`, `archiveProduct`, `CatalogApiError`, immutable `Product` records.
- Produces: donor list toolbar/table/mobile cards/empty/loading/error/archive confirmation without new filter or API authority.

- [ ] **Step 1: Write failing structural and authority assertions**

```js
test("product list ports donor presentation while preserving target commands", async () => {
  const source = await read("apps/customer-panel/components/catalog/ProductListConsole.tsx");
  assert.match(source, /catalogApi\.listProducts/);
  assert.match(source, /catalogApi\.archiveProduct\(archiveCandidate\.id, archiveCandidate\.version\)/);
  assert.match(source, /data-presentation="hemenaku-product-list"/);
  assert.match(source, /aria-label="Ürün durumu filtresi"/);
  assert.doesNotMatch(source, /\/api\/admin|storeId|tenantId|supabase|bulk-stock|homepage-curation/i);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --test tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
```

Expected: the product presentation test fails on the missing `data-presentation` marker while command/security assertions pass.

- [ ] **Step 3: Adapt donor list geometry**

Use donor `apps/admin/app/admin/urunler/ProductsPageClient.tsx:304-2070` only as markup/spacing source. Preserve the complete existing load/archive implementation. Root markup becomes:

```tsx
<section className="catalog-page" aria-labelledby="products-title" data-presentation="hemenaku-product-list">
  <div className="hemenaku-product-hero">...</div>
  <div className="hemenaku-catalog-surface">
    <div className="catalog-surface-heading">...</div>
    <div className="catalog-toolbar">...</div>
    {error ? <div className="feedback feedback-error" role="alert">...</div> : null}
    {loading ? <div className="catalog-loading" role="status">...</div> : items.length === 0 ? <div className="empty-state">...</div> : <div className="catalog-table-shell">...</div>}
  </div>
  {archiveCandidate ? <div role="alertdialog" aria-modal="true">...</div> : null}
</section>
```

Do not port donor search, category, stock threshold, CSV, bulk action or homepage curation because corresponding target API fields do not exist.

- [ ] **Step 4: Run focused list regressions and commit**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/components/catalog/ProductListConsole.tsx apps/customer-panel/app/globals.css apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
git commit -m "feat(customer-panel): transplant hemenaku product list"
```

Expected: focused command `15/15 PASS`; typecheck exits `0`.

---

### Task 7: Product Creation Wizard Presentation

**Files:**
- Modify: `apps/customer-panel/components/catalog/ProductCreateForm.tsx:1-end`
- Modify: `apps/customer-panel/app/globals.css:128-165,241-279`
- Modify: `apps/customer-panel/lib/product-console.test.ts`
- Modify: `tests/saas-phase3/product-media/ui-static.test.mjs`

**Interfaces:**
- Consumes: `buildCreateProductPayload`, `catalogApi.createProduct`, optional first image, `productMediaApi.upload` after durable product creation.
- Produces: donor-style finite two-stage wizard presentation with no SEO/category/nutrition authority and unchanged create→optional upload→detail redirect order.

- [ ] **Step 1: Add failing wizard workflow assertions**

```js
test("creation wizard remains bound to the durable target workflow", async () => {
  const source = await read("apps/customer-panel/components/catalog/ProductCreateForm.tsx");
  assert.match(source, /data-presentation="hemenaku-product-create"/);
  assert.match(source, /buildCreateProductPayload/);
  assert.match(source, /await catalogApi\.createProduct/);
  assert.match(source, /await productMediaApi\.upload/);
  assert.match(source, /location\.assign\(`\/products\/\$\{result\.product\.id\}`\)/);
  assert.doesNotMatch(source, /seo|nutrition|categoryId|\/api\/admin|supabase/i);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/product-media/ui-static.test.mjs
```

Expected: only the new presentation marker/step contract fails; existing create/upload ordering remains green.

- [ ] **Step 3: Port the supported wizard surfaces**

Adapt donor `ProductWizard.tsx:120-783`, `WizardStepper.tsx`, `StepBasicInfo.tsx`, `StepPricing.tsx`, `StepImages.tsx` presentation into the existing single form. Use a finite display-only step list; submission authority stays on the form:

```tsx
const STEPS = Object.freeze([
  { key: "basic", index: "01", label: "Temel Bilgiler" },
  { key: "pricing", index: "02", label: "Fiyat ve Stok" },
  { key: "media", index: "03", label: "Ürün Görseli" },
]);

<section data-presentation="hemenaku-product-create" className="catalog-page narrow-catalog-page">
  <div className="hemenaku-form-hero">...</div>
  <div className="hemenaku-wizard-stepper" aria-label="Ürün oluşturma adımları">...</div>
  <form className="catalog-form" onSubmit={submit}>...</form>
</section>
```

All fields remain in one native form so keyboard submission, server parser and validation order remain unchanged. The media request cannot run until `createProduct` resolves with a durable product ID.

- [ ] **Step 4: Run GREEN and commit**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/product-media/ui-static.test.mjs
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/components/catalog/ProductCreateForm.tsx apps/customer-panel/app/globals.css apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/product-media/ui-static.test.mjs
git commit -m "feat(customer-panel): transplant hemenaku product wizard"
```

Expected: focused catalog/media command `12/12 PASS`; workspace `122/122 PASS`.

---

### Task 8: Product Detail, Variants, and Media Presentation

**Files:**
- Modify: `apps/customer-panel/components/catalog/ProductDetailConsole.tsx:1-end`
- Modify: `apps/customer-panel/components/catalog/ProductMediaManager.tsx:1-end`
- Modify: `apps/customer-panel/app/globals.css:166-213,241-279`
- Modify: `apps/customer-panel/lib/product-console.test.ts`
- Modify: `tests/saas-phase3/product-media/ui-static.test.mjs`
- Modify: `tests/saas-phase3/product-media/static-security.test.mjs`

**Interfaces:**
- Consumes: existing product/variant commands with versions; existing product media list/upload/alt/reorder/archive commands.
- Produces: donor detail cards, variant editor, media gallery and controlled conflict/retry states; no additional API fields.

- [ ] **Step 1: Add failing detail/media presentation and security assertions**

```js
test("detail and media surfaces retain versioned target commands", async () => {
  const detail = await read("apps/customer-panel/components/catalog/ProductDetailConsole.tsx");
  const media = await read("apps/customer-panel/components/catalog/ProductMediaManager.tsx");
  assert.match(detail, /data-presentation="hemenaku-product-detail"/);
  assert.match(detail, /updateProduct\(productId, parsed\.value\)/);
  assert.match(detail, /updateVariant\(productId, variant\.id, parsed\.value\)/);
  assert.match(detail, /archiveVariant\(productId, archiveVariant\.id, archiveVariant\.version\)/);
  assert.match(detail, /failure\.code === "version_conflict"/);
  assert.match(media, /productMediaApi\.reorder/);
  assert.match(media, /productMediaApi\.archive/);
  assert.doesNotMatch(`${detail}\n${media}`, /storeId|tenantId|document\.cookie|\/api\/admin|supabase/i);
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/product-media/*.test.mjs
```

Expected: the new detail presentation marker fails; existing variant/media/security tests pass.

- [ ] **Step 3: Port detail and variant geometry**

Keep the current state machine and handlers. Root structure:

```tsx
<section data-presentation="hemenaku-product-detail" className="catalog-page">
  <div className="hemenaku-detail-hero">...</div>
  <div className="product-summary-grid">...</div>
  <section aria-labelledby="product-fields-title">...</section>
  <section aria-labelledby="variants-title" className="variant-list">...</section>
  <ProductMediaManager productId={productId} />
</section>
```

Every variant edit submits its persisted `version`; conflict still triggers `await load(true)` and the exact safe copy `En güncel veriler yeniden yüklendi`.

- [ ] **Step 4: Port media presentation without changing authority**

Keep exact media API calls and render:

```tsx
<section className="product-media-section" aria-labelledby="product-media-title">
  <div className="section-heading-row">...</div>
  <div className="media-upload-card">...</div>
  {items.length === 0 ? <div className="empty-state">...</div> : (
    <div className="product-media-grid">
      {items.map((item) => <article className="product-media-card" key={item.id}>...</article>)}
    </div>
  )}
</section>
```

Image `src`, alt text and ordering originate only from API response; no raw R2 key, store ID or signed secret is rendered.

- [ ] **Step 5: Run GREEN and commit**

Run:

```bash
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/product-media/*.test.mjs
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/components/catalog/ProductDetailConsole.tsx apps/customer-panel/components/catalog/ProductMediaManager.tsx apps/customer-panel/app/globals.css apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/product-media
git commit -m "feat(customer-panel): transplant hemenaku product detail"
```

Expected: catalog/media suite `15/15 PASS`; workspace `122/122 PASS`; typecheck exits `0`.

---

### Task 9: Whole-Branch Security, Accessibility, and Regression Gate

**Files:**
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs`
- Modify only if an assertion must reflect approved dependencies/presentation: `tests/saas-phase3/hemenaku-merchant-shell/static-security.test.mjs`
- No application behavior change is permitted in this task unless a failing acceptance test proves a defect in Tasks 1-8.

**Interfaces:**
- Consumes: all task commits.
- Produces: code-complete, locally verified branch ready for screenshot acceptance.

- [ ] **Step 1: Add final forbidden-authority and CSS accessibility tests**

```js
test("client presentation contains no private authority or donor runtime", async () => {
  const files = git("diff", "--name-only", `${BASE}...HEAD`).split("\n").filter((path) => /apps\/customer-panel\/.+\.(ts|tsx)$/.test(path));
  const source = (await Promise.all(files.map(read))).join("\n");
  assert.doesNotMatch(source, /@supabase|getAdminAuthContext|getBrowserSupabaseClient|STORE_RUNTIME|store-info-context|\/api\/admin\//i);
  assert.doesNotMatch(source, /document\.cookie|localStorage|sessionStorage|x-(?:tenant|store)-id/i);
});

test("presentation CSS preserves touch contrast overflow and reduced motion gates", async () => {
  const css = `${await read("apps/customer-panel/app/globals.css")}\n${await read("apps/customer-panel/components/panel/panel-shell.module.css")}\n${await read("apps/customer-panel/components/dashboard/panel-dashboard.module.css")}`;
  assert.match(css, /min-(?:width|height):\s*48px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.01ms/);
  assert.doesNotMatch(css, /overflow-x:\s*visible/);
});

test("tracked diff contains no secrets or forbidden identifiers", () => {
  const patch = git("diff", `${BASE}...HEAD`, "--", ".", ":(exclude)package-lock.json");
  assert.doesNotMatch(patch, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|v1\.panel\.|pb1\.|bs1\./i);
  assert.doesNotMatch(patch, /10000000-0000-4000-8000-000000000001|20000000-0000-4000-8000-000000000001/);
});
```

- [ ] **Step 2: Run complete customer-panel and Phase 3 matrix**

Run:

```bash
npm ci
npm test --workspace @celebix/customer-panel
node --experimental-transform-types --test tests/saas-phase3/hemenaku-merchant-shell/*.test.mjs tests/saas-phase3/hemenaku-admin-presentation/*.test.mjs
node --experimental-transform-types --test apps/customer-panel/lib/product-console.test.ts tests/saas-phase3/product-media/*.test.mjs
node --experimental-transform-types --test tests/saas-phase3/shared-merchant-catalog-dashboard/in-process.test.mjs tests/saas-phase3/shared-merchant-catalog-dashboard/static-security.test.mjs
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: workspace `122/122 PASS`; shell/presentation `23/23 PASS`; catalog/media `15/15 PASS`; dashboard static/in-process `4/4 PASS`; typecheck/build exit `0`.

- [ ] **Step 3: Run Owner unchanged regression evidence**

Run:

```bash
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
files=(${(f)"$(find apps/owner/lib -name '*.test.ts' -type f -print)"}); node --experimental-transform-types --test $files
```

Expected: Owner typecheck/build exit `0`; ad-hoc tests reproduce the exact baseline `263/268 PASS` with only the five pre-existing extensionless-import failures in `self-serve-flags`, `self-serve-onboarding`, `self-serve-persistent-registration-adapter`, `self-serve-registration`, and `self-serve-request-store`. Any new failure stops the task.

- [ ] **Step 4: Run diff, donor, dependency and secret scans**

Run:

```bash
git diff --check
test -z "$(git diff --name-only 6563a1428434e1974f50af3ffb843eb4067f686a...HEAD -- apps/admin apps/owner deploy infra infrastructure)"
git diff --name-only 6563a1428434e1974f50af3ffb843eb4067f686a...HEAD
git diff 6563a1428434e1974f50af3ffb843eb4067f686a...HEAD -- apps/customer-panel tests/saas-phase3 | rg -n 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|postgres(ql)?://[^ ]+:[^ ]+@|v1\.panel\.|pb1\.|bs1\.' && exit 1 || true
npm ls framer-motion recharts --workspace @celebix/customer-panel --depth=0
```

Expected: diff check and scans pass; protected-scope diff is empty; only approved two direct dependencies are listed.

- [ ] **Step 5: Commit the final gate**

```bash
git add tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs tests/saas-phase3/hemenaku-merchant-shell/static-security.test.mjs
git commit -m "test(customer-panel): verify hemenaku presentation parity"
```

Expected: no application file is committed in this gate unless a separately reviewed failing acceptance test required repair.

---

### Task 10: Local Visual and Interaction Acceptance

**Files:**
- Create untracked evidence only under: `.codex-artifacts/hemenaku-admin-presentation-transplant/<final-sha>/`
- No tracked source change.

**Interfaces:**
- Consumes: authenticated local/disposable customer-panel session through ordinary application flows; existing read-only donor screenshots under `.codex-artifacts/hemenaku-donor-audit/`.
- Produces: twelve target screenshots, measured accessibility values and a no-deploy code-complete report.

- [ ] **Step 1: Start an isolated local customer-panel using safe local configuration**

Run the repository's existing disposable/local auth bootstrap and then:

```bash
npm run dev --workspace @celebix/customer-panel
```

Expected: local server listens on `3400`; no production host, credential or data is used. If genuine authenticated local data cannot be established through existing flows, stop with `LOCAL_AUTH_ACCEPTANCE_BLOCKED`; do not forge cookies or insert sessions.

- [ ] **Step 2: Capture the exact screenshot matrix**

Using the browser verification workflow, capture:

```text
target-dashboard-1440x1024.png
target-dashboard-1280x800.png
target-dashboard-1025x768.png
target-dashboard-1024x768.png
target-dashboard-390x844.png
target-dashboard-320x720.png
target-products-1440x1024.png
target-products-390x844.png
target-products-new-1440x1024.png
target-products-new-390x844.png
target-product-detail-1440x1024.png
target-drawer-products-390x844.png
```

Expected: all twelve files exist under the final-SHA evidence directory; earlier donor and target evidence remains unchanged.

- [ ] **Step 3: Measure responsive and accessibility acceptance**

For every required viewport, record `document.documentElement.scrollWidth - document.documentElement.clientWidth === 0`. Verify:

```text
1024px: mobile shell
1025px: desktop shell
minimum interactive target: 48x48px
primary CTA contrast: >= 4.5:1
reduced-motion animation duration: approximately 0.01ms
drawer closes: Escape, backdrop, close button, >=64px swipe
drawer close focus: returns to Menu control
bottom dock overlap with content/form inputs: 0px
/products-evil Products active state: false
console errors: 0
production/internal-host requests: 0
```

- [ ] **Step 4: Verify truthful states and security surfaces**

Exercise dashboard loading/ready/error, products loading/empty/loaded/error, archive cancel/confirm, create validation/success, detail conflict recovery, variant create/update/archive, media upload/alt/reorder/archive. Inspect DOM, RSC payloads, network, console and runtime logs for raw session credential, cookie, token, principal/store/membership/domain IDs and database errors; expected leak count is `0`.

- [ ] **Step 5: Final branch review, push, and stop before deployment**

Run:

```bash
git status --short
git log --oneline 6563a1428434e1974f50af3ffb843eb4067f686a..HEAD
git diff --name-only 6563a1428434e1974f50af3ffb843eb4067f686a...HEAD -- apps/admin apps/owner deploy infra infrastructure
git push -u origin codex/hemenaku-admin-presentation-transplant-implementation
git rev-parse HEAD
git ls-remote --heads origin refs/heads/codex/hemenaku-admin-presentation-transplant-implementation
```

Expected: only `.codex-artifacts/` is untracked; protected-scope diff is empty; local and remote SHA match. Report `PASS — HEMENAKU_ADMIN_PRESENTATION_CODE_COMPLETE`; staging deploy, production deploy, merge and credential mutation all remain `0`. Request a separate isolated staging acceptance authorization rather than deploying automatically.

## Commit Map

1. `build(customer-panel): pin hemenaku presentation dependencies`
2. `test(customer-panel): harden presentation authority`
3. `feat(customer-panel): port hemenaku presentation primitives`
4. `feat(customer-panel): transplant hemenaku responsive shell`
5. `feat(customer-panel): render truthful hemenaku dashboard`
6. `feat(customer-panel): transplant hemenaku product list`
7. `feat(customer-panel): transplant hemenaku product wizard`
8. `feat(customer-panel): transplant hemenaku product detail`
9. `test(customer-panel): verify hemenaku presentation parity`

## Completion Definition

The phase is code-complete only when all 10 tasks and every checkbox pass, the twelve local artifacts exist, `apps/admin/**` and Owner/deploy/infrastructure diffs are zero, customer-panel and Phase 3 totals match the gates above, and local/remote branch SHAs match. This plan does not claim orders/customers/analytics/backend parity; those surfaces require their own shared authority specs before navigation activation. Within the system's currently implemented session/catalog/media capabilities, presentation and interaction parity must have no omitted state.
