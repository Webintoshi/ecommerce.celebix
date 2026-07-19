# Hemenaku Merchant Shell and Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the pinned Hemenaku admin shell, truthful dashboard, and responsive navigation language into apps/customer-panel without importing donor authority, showing unsupported features, or changing production.

**Architecture:** The existing server-only panel access guard resolves the durable PostgreSQL TenantContext once in the authenticated layout. A pure server projection converts it to a frozen, display-only PanelChromeModel; only that safe model crosses into the client shell. Static immutable navigation metadata contains only working customer-panel routes. Desktop and mobile presentation components copy the pinned donor geometry and interaction rules, while dashboard cards are derived only from the safe projection.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript 5.9, CSS Modules, lucide-react 0.563.x, Node 24 test runner, existing SaaS contracts/data workspaces, and the existing server-panel session authority.

## Global Constraints

- Implementation starts from exact commit d020e96c6a7e5336e64d586683985fd6bf4f354e. The design commit is documentation only and must not become the application base.
- Donor source is immutable commit fc6c5318b47f045a7cefcedc7612d5b10563ba32. Never read donor behavior from a moving branch without first proving that exact SHA.
- apps/admin is read-only. No donor file, donor dependency, donor route, or donor runtime is copied wholesale.
- The only tenant authority remains __Host-celebix_panel -> requireServerPanelAccess -> durable PostgreSQL TenantContext.
- Do not add Supabase, legacy Logto admin authority, /api/admin calls, browser-selected tenant/store IDs, iframe, reverse proxy, apps/admin-shared, or a second admin application.
- Do not display Orders, Customers, Marketing, CMS, Accounting, SEO, Toshi, notifications, analytics, revenue, conversion, or other deferred modules.
- apps/customer-panel/lib/routes.test.ts is additionally authorized only for the two stale active-store route-export assertions at current lines 44-66 and 104-122. Do not change route implementation or unrelated route assertions.
- Production configuration, credentials, deployment, mutation, merge, and activation remain forbidden.
- Isolated customer-panel staging deployment is a separate final gate and requires a new explicit Atlas authorization.
- Expected implementation effort remains 8.5-12.5 engineering days, excluding review/authorization wait time.

## Frozen Source and Line Map

| Purpose | Exact source and lines |
|---|---|
| Tenant roles | packages/saas-contracts/src/types.ts:18-19 |
| Full server authority contract | packages/saas-contracts/src/types.ts:236-266 |
| Sole protected-page guard | apps/customer-panel/lib/server-access.ts:1-10 |
| Authenticated panel layout | apps/customer-panel/app/(panel)/layout.tsx:1-9 |
| Current dashboard placeholder | apps/customer-panel/app/(panel)/page.tsx:1-18 |
| Current unsafe full-context shell prop | apps/customer-panel/components/panel/PanelShell.tsx:1-65 |
| Current near-match navigation bug | apps/customer-panel/components/panel/PanelNavigation.tsx:1-37, especially 27 |
| Existing safe logout mutation | apps/customer-panel/components/panel/LogoutButton.tsx:1-36 |
| Current global shell/catalog CSS | apps/customer-panel/app/globals.css:1-345; shell rules 34-81 and 275-307 |
| Customer-panel scripts/dependencies | apps/customer-panel/package.json:6-28 |
| Existing shell source regressions | apps/customer-panel/lib/product-console.test.ts:38-78 and 113-118 |
| Authorized stale assertions only | apps/customer-panel/lib/routes.test.ts:44-66 and 104-122 |
| Donor global token source | apps/admin/app/globals.css@fc6c5318:3-95 |
| Donor server/client shell boundary | apps/admin/app/admin/layout.tsx@fc6c5318:1-45 |
| Donor topbar/mobile surface model | apps/admin/app/admin/AdminLayoutClient.tsx@fc6c5318:19-238 and 240-649 |
| Donor menu/path/drawer behavior | apps/admin/components/admin/AdminSidebar.tsx@fc6c5318:60-219, 252-569, and 570-997 |
| Donor topbar portal contract | apps/admin/components/admin/AdminTopbarChrome.tsx@fc6c5318:1-82 |
| Donor page primitives | apps/admin/components/admin/AdminPageShell.tsx@fc6c5318:1-392 |
| Donor dashboard geometry only | apps/admin/components/admin/dashboard/DashboardHomeView.tsx@fc6c5318:313-478, 592-689, and 1505-1578 |

New files below are always created as whole files starting at line 1. Existing-file ranges are rechecked with nl -ba before each edit; if upstream line drift exists, stop rather than editing by approximate location.

## Exact Contracts

~~~ts
export interface PanelChromeModel {
  readonly storeSlug: string;
  readonly membershipLabel: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly entitlementStatus: "active";
  readonly storefrontHostname?: string;
  readonly locale: string;
}

export type PanelNavigationHref = "/" | "/products" | "/products/new" | "/setup";
export type PanelNavigationIcon = "home" | "products" | "add-product" | "setup";

export interface PanelNavigationItem {
  readonly key: "overview" | "catalog" | "products" | "new-product" | "setup";
  readonly label: string;
  readonly href: PanelNavigationHref;
  readonly icon: PanelNavigationIcon;
  readonly children?: readonly PanelNavigationItem[];
}

export interface PanelDashboardCard {
  readonly key: "store" | "membership" | "plan" | "storefront";
  readonly label: string;
  readonly value: string;
  readonly status: string;
  readonly detail?: string;
}

export interface PanelDashboardAction {
  readonly label: string;
  readonly href: "/products" | "/products/new" | "/setup";
}

export interface PanelDashboardModel {
  readonly title: "Genel bakış";
  readonly description: string;
  readonly cards: readonly PanelDashboardCard[];
  readonly actions: readonly PanelDashboardAction[];
}

export interface PanelTopbarChromeState {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: React.ReactNode;
}

export interface PanelLayoutClientProps {
  readonly model: PanelChromeModel;
  readonly children: React.ReactNode;
}

export interface PanelSidebarProps {
  readonly model: PanelChromeModel;
  readonly mode: "desktop" | "drawer";
  readonly open?: boolean;
  readonly onClose?: () => void;
  readonly triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export interface PanelMobileDockProps {
  readonly pathname: string;
  readonly menuOpen: boolean;
  readonly menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  readonly onMenuToggle: () => void;
}
~~~

PanelPageShell exports are fixed to PanelPageShell, PanelPageHeader, PanelPanel, PanelToolbar, PanelBadge, PanelStatusBadge, PanelMetricCard, PanelDataTable, PanelLoadingState, PanelActionButton, and PanelEmptyState. These are presentation-only React contracts; they accept children/text and never TenantContext, IDs, repositories, or browser authority.

## Commit Map

1. test(saas): align panel route export fixtures
2. feat(saas): project safe panel chrome model
3. feat(saas): define merchant panel navigation
4. feat(saas): project truthful merchant dashboard
5. feat(saas): add hemenaku panel chrome primitives
6. feat(saas): adopt hemenaku desktop merchant shell
7. feat(saas): add responsive merchant navigation
8. feat(saas): render truthful merchant dashboard
9. test(saas): lock merchant shell security and parity

Every commit must pass its focused green command before it is created. Do not combine authority projection, navigation, desktop, mobile, and dashboard into one review unit.

---

### Task 1: Pin the donor and repair only the two authorized stale route assertions

**Files:**
- Modify: apps/customer-panel/lib/routes.test.ts:44-66 and 104-122 only
- Verify read-only: apps/customer-panel/app/api/session/active-store/route.ts:1-3
- Verify read-only: apps/customer-panel/lib/server-panel-session-controls/handler.test.ts
- Verify read-only: apps/customer-panel/lib/server-panel-session-controls/request-authority.test.ts

- [ ] **Step 1: Verify implementation base, donor commit, donor files, and read-only status**

~~~bash
git fetch origin --prune
test "$(git rev-parse HEAD)" = "d020e96c6a7e5336e64d586683985fd6bf4f354e"
test "$(git ls-remote origin refs/heads/deploy/admin/hemenaku | cut -f1)" = "fc6c5318b47f045a7cefcedc7612d5b10563ba32"
git cat-file -e fc6c5318b47f045a7cefcedc7612d5b10563ba32^{commit}
for file in \
  apps/admin/app/globals.css \
  apps/admin/app/admin/layout.tsx \
  apps/admin/app/admin/AdminLayoutClient.tsx \
  apps/admin/components/admin/AdminSidebar.tsx \
  apps/admin/components/admin/AdminTopbarChrome.tsx \
  apps/admin/components/admin/AdminPageShell.tsx \
  apps/admin/components/admin/dashboard/DashboardHomeView.tsx
do
  git cat-file -e "fc6c5318b47f045a7cefcedc7612d5b10563ba32:$file"
done
test -z "$(git diff --name-only d020e96c6a7e5336e64d586683985fd6bf4f354e...HEAD -- apps/admin)"
~~~

Expected: every command exits 0; donor HEAD is exact; apps/admin diff is empty.

- [ ] **Step 2: Record the intentional red baseline**

~~~bash
npm ci --include=optional --no-audit --no-fund
node --experimental-transform-types --test apps/customer-panel/lib/routes.test.ts
npm test --workspace @celebix/customer-panel
~~~

Expected red:

- routes.test.ts: 6/8 PASS, with only “active-store switch stays controlled unavailable…” and “state-changing routes reject…” failing because server-only makes the direct route import unavailable;
- customer-panel: 65/67 PASS with those same two failures;
- no implementation file has changed.

- [ ] **Step 3: Replace the first stale export assertion with source-backed export evidence**

At current lines 44-47, use:

~~~ts
const routeSource = await readFile(
  new URL("../app/api/session/active-store/route.ts", import.meta.url),
  "utf8",
);
assert.match(routeSource, /export const POST = handleDefaultPanelActiveStore;/);
if (typeof route.POST !== "function") return;
~~~

Keep the existing status, Set-Cookie, and response-body assertions byte-for-byte unchanged.

- [ ] **Step 4: Replace the second stale export assertion without weakening Origin tests**

Read the same route source once before the origin loop. Replace only the switcher export assertion path with:

~~~ts
if (handler === switcher.POST && typeof handler !== "function") {
  assert.match(switcherSource, /export const POST = handleDefaultPanelActiveStore;/);
  continue;
}
assert.equal(typeof handler, "function");
~~~

The logout Origin assertions remain unchanged. The already-focused session-control tests remain the behavioral authority for approved-staging missing/wrong Origin 403; this file only stops treating Node’s server-only import guard as a missing route export. No route implementation change is permitted.

- [ ] **Step 5: Run the repaired route and full workspace tests**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/routes.test.ts
npm test --workspace @celebix/customer-panel
git diff --check
git diff --name-only
~~~

Expected: routes 8/8 PASS; customer-panel 67/67 PASS; only apps/customer-panel/lib/routes.test.ts is changed.

- [ ] **Step 6: Commit the isolated fixture repair**

~~~bash
git add apps/customer-panel/lib/routes.test.ts
git commit -m "test(saas): align panel route export fixtures"
~~~

### Task 2: Project TenantContext to a frozen PanelChromeModel

**Files:**
- Create: apps/customer-panel/lib/panel-ui/chrome-model.test.ts (whole file)
- Create: apps/customer-panel/lib/panel-ui/chrome-model.ts (whole file)
- Modify: apps/customer-panel/package.json:6-12, test script only
- Reference: packages/saas-contracts/src/types.ts:18-19 and 246-266

- [ ] **Step 1: Write six failing security/projection tests**

Create chrome-model.test.ts with six node:test cases covering exact projection, all four supported roles, freezing, forbidden values/keys, invalid active authority, and durable resolved-host binding:

~~~ts
import assert from "node:assert/strict";
import test from "node:test";
import type { StoreMembershipRole, TenantContext } from "@celebix/saas-contracts";
import { createPanelChromeModel } from "./chrome-model.ts";

const CONTEXT: TenantContext = {
  schemaVersion: 1,
  requestId: "90000000-0000-4000-8000-000000000001",
  principal: {
    id: "10000000-0000-4000-8000-000000000001",
    issuer: "https://identity.example.test/oidc",
    subject: "merchant-subject",
  },
  store: { id: "20000000-0000-4000-8000-000000000001", slug: "atlas-store", status: "active" },
  membership: {
    id: "30000000-0000-4000-8000-000000000001",
    role: "store_owner",
    status: "active",
  },
  entitlements: {
    schemaVersion: 1,
    planId: "40000000-0000-4000-8000-000000000001",
    planCode: "free_starter",
    version: 3,
    status: "active",
    features: ["catalog", "media"],
    limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 },
    validFrom: "2026-07-19T00:00:00.000Z",
  },
  resolvedHost: {
    schemaVersion: 1,
    hostname: "atlas-store.celebix.site",
    domainId: "50000000-0000-4000-8000-000000000001",
    domainType: "platform_subdomain",
    storeId: "20000000-0000-4000-8000-000000000001",
    storeSlug: "atlas-store",
    canonicalHostname: "atlas-store.celebix.site",
    status: "active",
    cacheVersion: 2,
  },
  locale: "tr-TR",
};

test("projects only the exact display contract", () => {
  assert.deepEqual(createPanelChromeModel(CONTEXT), {
    storeSlug: "atlas-store",
    membershipLabel: "Mağaza sahibi",
    planCode: "free_starter",
    planVersion: 3,
    entitlementStatus: "active",
    storefrontHostname: "atlas-store.celebix.site",
    locale: "tr-TR",
  });
});

test("maps every contract role to an exact Turkish label", () => {
  const labels: Record<StoreMembershipRole, string> = {
    store_owner: "Mağaza sahibi",
    admin: "Mağaza yöneticisi",
    editor: "İçerik editörü",
    analyst: "Analist",
  };
  for (const [role, label] of Object.entries(labels)) {
    const input = { ...CONTEXT, membership: { ...CONTEXT.membership, role } } as TenantContext;
    assert.equal(createPanelChromeModel(input).membershipLabel, label);
  }
});

test("returns an immutable projection", () => {
  assert.equal(Object.isFrozen(createPanelChromeModel(CONTEXT)), true);
});

test("does not expose authority IDs, issuer, subject, request, or credentials", () => {
  const json = JSON.stringify(createPanelChromeModel(CONTEXT));
  for (const value of [
    CONTEXT.requestId,
    CONTEXT.principal.id,
    CONTEXT.principal.issuer,
    CONTEXT.principal.subject,
    CONTEXT.store.id,
    CONTEXT.membership.id,
    CONTEXT.entitlements.planId,
    CONTEXT.resolvedHost?.domainId,
  ]) assert.equal(json.includes(String(value)), false);
  assert.doesNotMatch(json, /principal|membershipId|storeId|planId|domainId|requestId|cookie|token/i);
});

test("fails closed for inactive or malformed durable authority", () => {
  const inactive = { ...CONTEXT, entitlements: { ...CONTEXT.entitlements, status: "expired" } };
  assert.throws(
    () => createPanelChromeModel(inactive as unknown as TenantContext),
    /panel_chrome_context_invalid/,
  );
  const malformed = { ...CONTEXT, store: { ...CONTEXT.store, slug: "Atlas Store" } };
  assert.throws(
    () => createPanelChromeModel(malformed as TenantContext),
    /panel_chrome_context_invalid/,
  );
});

test("accepts storefront hostname only from a matching durable resolved host", () => {
  const absent = { ...CONTEXT, resolvedHost: undefined };
  assert.equal(createPanelChromeModel(absent).storefrontHostname, undefined);
  const mismatch = {
    ...CONTEXT,
    resolvedHost: { ...CONTEXT.resolvedHost!, storeId: "60000000-0000-4000-8000-000000000001" },
  };
  assert.throws(
    () => createPanelChromeModel(mismatch as TenantContext),
    /panel_chrome_context_invalid/,
  );
});
~~~

- [ ] **Step 2: Run the focused test and confirm RED**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/chrome-model.test.ts
~~~

Expected: ERR_MODULE_NOT_FOUND for chrome-model.ts; no assertions pass by fallback.

- [ ] **Step 3: Implement the minimal validated projection**

Create chrome-model.ts:

~~~ts
import type { StoreMembershipRole, TenantContext } from "@celebix/saas-contracts";

export interface PanelChromeModel {
  readonly storeSlug: string;
  readonly membershipLabel: string;
  readonly planCode: string;
  readonly planVersion: number;
  readonly entitlementStatus: "active";
  readonly storefrontHostname?: string;
  readonly locale: string;
}

const ROLE_LABELS: Readonly<Record<StoreMembershipRole, string>> = Object.freeze({
  store_owner: "Mağaza sahibi",
  admin: "Mağaza yöneticisi",
  editor: "İçerik editörü",
  analyst: "Analist",
});

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function validText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value;
}

function invalid(): never {
  throw new Error("panel_chrome_context_invalid");
}

export function createPanelChromeModel(context: TenantContext): PanelChromeModel {
  if (
    context?.schemaVersion !== 1 ||
    context.store?.status !== "active" ||
    !validText(context.store.slug, 63) ||
    !SLUG.test(context.store.slug) ||
    context.membership?.status !== "active" ||
    !Object.hasOwn(ROLE_LABELS, context.membership.role) ||
    context.entitlements?.status !== "active" ||
    !validText(context.entitlements.planCode, 100) ||
    !Number.isSafeInteger(context.entitlements.version) ||
    context.entitlements.version < 1 ||
    !validText(context.locale, 35)
  ) invalid();

  const host = context.resolvedHost;
  if (
    host &&
    (
      host.status !== "active" ||
      host.storeId !== context.store.id ||
      host.storeSlug !== context.store.slug ||
      !validText(host.canonicalHostname, 253) ||
      !HOSTNAME.test(host.canonicalHostname)
    )
  ) invalid();

  return Object.freeze({
    storeSlug: context.store.slug,
    membershipLabel: ROLE_LABELS[context.membership.role],
    planCode: context.entitlements.planCode,
    planVersion: context.entitlements.version,
    entitlementStatus: "active" as const,
    ...(host ? { storefrontHostname: host.canonicalHostname } : {}),
    locale: context.locale,
  });
}
~~~

- [ ] **Step 4: Make nested panel-ui tests part of the workspace test command**

Change package.json line 11 to exactly:

~~~json
"test": "node --experimental-transform-types --test lib/*.test.ts lib/panel-ui/*.test.ts"
~~~

- [ ] **Step 5: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/lib/panel-ui/chrome-model.ts \
  apps/customer-panel/lib/panel-ui/chrome-model.test.ts \
  apps/customer-panel/package.json
git commit -m "feat(saas): project safe panel chrome model"
~~~

Expected: 73/73 customer-panel tests PASS; typecheck PASS.

### Task 3: Define immutable supported-route navigation and reject near matches

**Files:**
- Create: apps/customer-panel/lib/panel-ui/navigation.test.ts
- Create: apps/customer-panel/lib/panel-ui/navigation.ts
- Reference: apps/customer-panel/components/panel/PanelNavigation.tsx:6-29
- Donor reference: apps/admin/components/admin/AdminSidebar.tsx@fc6c5318:60-219

- [ ] **Step 1: Write six failing navigation tests**

~~~ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_NAVIGATION,
  getPanelNavigationState,
  isPanelNavigationPathActive,
} from "./navigation.ts";

test("contains exactly the four working hrefs", () => {
  const hrefs = PANEL_NAVIGATION.flatMap((item) => [
    item.href,
    ...(item.children ?? []).map((child) => child.href),
  ]);
  assert.deepEqual([...new Set(hrefs)], ["/", "/products", "/products/new", "/setup"]);
});

test("keeps the catalog parent active on exact descendants", () => {
  assert.equal(isPanelNavigationPathActive("/products", "/products"), true);
  assert.equal(isPanelNavigationPathActive("/products/new", "/products"), true);
  assert.equal(isPanelNavigationPathActive("/products/uuid", "/products"), true);
});

test("rejects near-match and alternate path spellings", () => {
  for (const path of ["/products-evil", "/product", "//products", "/Products"]) {
    assert.equal(isPanelNavigationPathActive(path, "/products"), false);
  }
});

test("matches root only at root", () => {
  assert.equal(isPanelNavigationPathActive("/", "/"), true);
  assert.equal(isPanelNavigationPathActive("/setup", "/"), false);
});

test("contains no deferred module label or href", () => {
  const text = JSON.stringify(PANEL_NAVIGATION);
  assert.doesNotMatch(text, /order|sipariş|customer|müşteri|marketing|cms|muhasebe|seo|toshi|notification|admin/i);
});

test("returns immutable navigation and state", () => {
  assert.equal(Object.isFrozen(PANEL_NAVIGATION), true);
  assert.equal(Object.isFrozen(PANEL_NAVIGATION[1].children), true);
  assert.equal(Object.isFrozen(getPanelNavigationState("/products/new")), true);
});
~~~

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/navigation.test.ts
~~~

Expected: ERR_MODULE_NOT_FOUND for navigation.ts.

- [ ] **Step 3: Implement the exact navigation contract**

~~~ts
export type PanelNavigationHref = "/" | "/products" | "/products/new" | "/setup";
export type PanelNavigationIcon = "home" | "products" | "add-product" | "setup";

export interface PanelNavigationItem {
  readonly key: "overview" | "catalog" | "products" | "new-product" | "setup";
  readonly label: string;
  readonly href: PanelNavigationHref;
  readonly icon: PanelNavigationIcon;
  readonly children?: readonly PanelNavigationItem[];
}

const CATALOG_CHILDREN = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "products", label: "Tüm ürünler", href: "/products", icon: "products" }),
  Object.freeze({ key: "new-product", label: "Yeni ürün", href: "/products/new", icon: "add-product" }),
]);

export const PANEL_NAVIGATION = Object.freeze<readonly PanelNavigationItem[]>([
  Object.freeze({ key: "overview", label: "Genel bakış", href: "/", icon: "home" }),
  Object.freeze({
    key: "catalog",
    label: "Ürünler",
    href: "/products",
    icon: "products",
    children: CATALOG_CHILDREN,
  }),
  Object.freeze({ key: "setup", label: "Kurulum", href: "/setup", icon: "setup" }),
]);

export function isPanelNavigationPathActive(pathname: string, href: PanelNavigationHref): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function getPanelNavigationState(pathname: string) {
  return Object.freeze(
    PANEL_NAVIGATION.map((item) =>
      Object.freeze({
        key: item.key,
        active: isPanelNavigationPathActive(pathname, item.href),
        children: Object.freeze(
          (item.children ?? []).map((child) =>
            Object.freeze({
              key: child.key,
              active: isPanelNavigationPathActive(pathname, child.href),
            }),
          ),
        ),
      }),
    ),
  );
}
~~~

- [ ] **Step 4: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/lib/panel-ui/navigation.ts \
  apps/customer-panel/lib/panel-ui/navigation.test.ts
git commit -m "feat(saas): define merchant panel navigation"
~~~

Expected: 79/79 customer-panel tests PASS.

### Task 4: Define a truthful immutable dashboard model

**Files:**
- Create: apps/customer-panel/lib/panel-ui/dashboard-model.test.ts
- Create: apps/customer-panel/lib/panel-ui/dashboard-model.ts
- Reference: apps/customer-panel/app/(panel)/page.tsx:1-18
- Donor geometry reference only: DashboardHomeView.tsx@fc6c5318:313-478 and 592-689

- [ ] **Step 1: Write four failing dashboard-model tests**

~~~ts
import assert from "node:assert/strict";
import test from "node:test";
import type { PanelChromeModel } from "./chrome-model.ts";
import { createPanelDashboardModel } from "./dashboard-model.ts";

const chrome: PanelChromeModel = Object.freeze({
  storeSlug: "atlas-store",
  membershipLabel: "Mağaza sahibi",
  planCode: "free_starter",
  planVersion: 3,
  entitlementStatus: "active",
  storefrontHostname: "atlas-store.celebix.site",
  locale: "tr-TR",
});

test("projects exact store, membership, plan, and storefront facts", () => {
  const model = createPanelDashboardModel(chrome);
  assert.deepEqual(model.cards.map(({ key, value }) => ({ key, value })), [
    { key: "store", value: "atlas-store" },
    { key: "membership", value: "Mağaza sahibi" },
    { key: "plan", value: "free_starter · v3" },
    { key: "storefront", value: "atlas-store.celebix.site" },
  ]);
});

test("offers only working product and setup actions", () => {
  assert.deepEqual(createPanelDashboardModel(chrome).actions.map((action) => action.href), [
    "/products",
    "/products/new",
    "/setup",
  ]);
});

test("emits no fake commerce KPI or deferred module", () => {
  assert.doesNotMatch(
    JSON.stringify(createPanelDashboardModel(chrome)),
    /revenue|ciro|order|sipariş|conversion|dönüşüm|visitor|sepet|customer|analytics|stok toplamı/i,
  );
});

test("deep-freezes cards, actions, and the root", () => {
  const model = createPanelDashboardModel(chrome);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.cards), true);
  assert.equal(model.cards.every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(model.actions), true);
  assert.equal(model.actions.every(Object.isFrozen), true);
});
~~~

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/dashboard-model.test.ts
~~~

Expected: ERR_MODULE_NOT_FOUND for dashboard-model.ts.

- [ ] **Step 3: Implement the minimal truthful view-model**

~~~ts
import type { PanelChromeModel } from "./chrome-model.ts";

export interface PanelDashboardCard {
  readonly key: "store" | "membership" | "plan" | "storefront";
  readonly label: string;
  readonly value: string;
  readonly status: string;
  readonly detail?: string;
}

export interface PanelDashboardAction {
  readonly label: string;
  readonly href: "/products" | "/products/new" | "/setup";
}

export interface PanelDashboardModel {
  readonly title: "Genel bakış";
  readonly description: string;
  readonly cards: readonly PanelDashboardCard[];
  readonly actions: readonly PanelDashboardAction[];
}

export function createPanelDashboardModel(chrome: PanelChromeModel): PanelDashboardModel {
  const cards = Object.freeze([
    Object.freeze({ key: "store" as const, label: "Etkin mağaza", value: chrome.storeSlug, status: "Etkin" }),
    Object.freeze({ key: "membership" as const, label: "Üyelik", value: chrome.membershipLabel, status: "Etkin" }),
    Object.freeze({
      key: "plan" as const,
      label: "Plan",
      value: chrome.planCode + " · v" + String(chrome.planVersion),
      status: "Aktif",
    }),
    Object.freeze({
      key: "storefront" as const,
      label: "Mağaza adresi",
      value: chrome.storefrontHostname ?? "Henüz bağlı değil",
      status: chrome.storefrontHostname ? "Doğrulandı" : "Bekliyor",
    }),
  ]);
  const actions = Object.freeze([
    Object.freeze({ label: "Ürünleri yönet", href: "/products" as const }),
    Object.freeze({ label: "Yeni ürün ekle", href: "/products/new" as const }),
    Object.freeze({ label: "Kurulumu gözden geçir", href: "/setup" as const }),
  ]);
  return Object.freeze({
    title: "Genel bakış" as const,
    description: "Mağazanızın doğrulanmış erişim, plan ve katalog başlangıç görünümü.",
    cards,
    actions,
  });
}
~~~

- [ ] **Step 4: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/lib/panel-ui/dashboard-model.ts \
  apps/customer-panel/lib/panel-ui/dashboard-model.test.ts
git commit -m "feat(saas): project truthful merchant dashboard"
~~~

Expected: 83/83 customer-panel tests PASS.

### Task 5: Add lucide and Hemenaku page/topbar primitives

**Files:**
- Create: apps/customer-panel/lib/panel-shell.test.ts; first two tests
- Create: apps/customer-panel/components/panel/PanelTopbarChrome.tsx
- Create: apps/customer-panel/components/panel/PanelPageShell.tsx
- Create: apps/customer-panel/components/panel/panel-shell.module.css; primitive classes first
- Modify: apps/customer-panel/package.json:13-22
- Modify: package-lock.json; npm-generated lucide edge only
- Donor reference: AdminTopbarChrome.tsx@fc6c5318:1-82 and AdminPageShell.tsx@fc6c5318:1-392

- [ ] **Step 1: Write two failing source-contract tests**

~~~ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("topbar chrome exposes a provider, page bridge, and dedicated action portal", async () => {
  const topbar = await source("components/panel/PanelTopbarChrome.tsx");
  assert.match(topbar, /PanelTopbarChromeProvider/);
  assert.match(topbar, /PanelTopbarBridge/);
  assert.match(topbar, /panel-topbar-actions/);
  assert.match(topbar, /createPortal/);
});

test("page shell exports the fixed Hemenaku-derived primitive set without donor imports", async () => {
  const pageShell = await source("components/panel/PanelPageShell.tsx");
  for (const name of [
    "PanelPageShell", "PanelPageHeader", "PanelPanel", "PanelToolbar", "PanelBadge",
    "PanelStatusBadge", "PanelMetricCard", "PanelDataTable", "PanelLoadingState",
    "PanelActionButton", "PanelEmptyState",
  ]) assert.match(pageShell, new RegExp("export function " + name));
  assert.doesNotMatch(pageShell, /apps\/admin|@\/components\/admin|\/api\/admin|supabase/i);
});
~~~

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-shell.test.ts
~~~

Expected: 0/2 PASS; both fail with ENOENT for the new components.

- [ ] **Step 3: Install the one authorized runtime dependency**

~~~bash
npm install lucide-react@^0.563.0 --workspace @celebix/customer-panel --save
npm ls lucide-react --workspace @celebix/customer-panel
git diff -- package-lock.json apps/customer-panel/package.json
~~~

Expected: lucide-react resolves to 0.563.x; only the customer-panel direct edge and npm-generated lock metadata change; no unrelated version churn.

- [ ] **Step 4: Implement the topbar portal contract**

PanelTopbarChrome.tsx must use this minimal contract:

~~~tsx
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface PanelTopbarChromeState {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions?: ReactNode;
}

type Setter = (state: PanelTopbarChromeState | null) => void;
const Context = createContext<Setter | null>(null);

export function PanelTopbarChromeProvider(
  { children, onChange }: { children: ReactNode; onChange: Setter },
) {
  return <Context.Provider value={onChange}>{children}</Context.Provider>;
}

export function usePanelTopbarChrome(state: PanelTopbarChromeState) {
  const setState = useContext(Context);
  useEffect(() => {
    setState?.({ title: state.title, subtitle: state.subtitle });
    return () => setState?.(null);
  }, [setState, state.subtitle, state.title]);
}

function useTopbarActionsTarget() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let frame = window.requestAnimationFrame(() => {
      setTarget(document.getElementById("panel-topbar-actions"));
    });
    const observer = new MutationObserver(() => {
      setTarget(document.getElementById("panel-topbar-actions"));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return target;
}

export function PanelTopbarBridge(state: PanelTopbarChromeState) {
  usePanelTopbarChrome(state);
  const target = useTopbarActionsTarget();
  return target && state.actions ? createPortal(state.actions, target) : null;
}
~~~

- [ ] **Step 5: Implement the fixed page primitive exports**

PanelPageShell.tsx must implement each declared export as a small semantic wrapper. The required core is:

~~~tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { PanelTopbarBridge } from "./PanelTopbarChrome";
import styles from "./panel-shell.module.css";

export function PanelPageShell({ children }: { children: ReactNode }) {
  return <section className={styles.pageShell}>{children}</section>;
}

export function PanelPageHeader(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <PanelTopbarBridge title={props.title} subtitle={props.description} actions={props.actions} />
      <header className={styles.pageHeader}>
        <div><h1>{props.title}</h1>{props.description ? <p>{props.description}</p> : null}</div>
        {props.actions ? <div className={styles.pageActions}>{props.actions}</div> : null}
      </header>
    </>
  );
}

export function PanelPanel({ children, title }: { children: ReactNode; title?: string }) {
  return <section className={styles.panel}>{title ? <h2>{title}</h2> : null}{children}</section>;
}

export function PanelToolbar({ children }: { children: ReactNode }) {
  return <div className={styles.toolbar}>{children}</div>;
}

export function PanelBadge({ children }: { children: ReactNode }) {
  return <span className={styles.badge}>{children}</span>;
}

export function PanelStatusBadge({ children, tone = "neutral" }: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span className={styles["status-" + tone]}>{children}</span>;
}

export function PanelMetricCard(props: { label: string; value: string; detail?: string }) {
  return <article className={styles.metric}><span>{props.label}</span><strong>{props.value}</strong>{props.detail ? <small>{props.detail}</small> : null}</article>;
}

export function PanelDataTable({ children, label }: { children: ReactNode; label: string }) {
  return <div className={styles.tableScroll}><table aria-label={label}>{children}</table></div>;
}

export function PanelLoadingState({ label = "Yükleniyor" }: { label?: string }) {
  return <p className={styles.state} role="status">{label}</p>;
}

export function PanelActionButton(props: { href: string; children: ReactNode; primary?: boolean }) {
  return <Link className={props.primary ? styles.primaryAction : styles.action} href={props.href}>{props.children}</Link>;
}

export function PanelEmptyState(props: { title: string; description: string; action?: ReactNode }) {
  return <div className={styles.empty}><h2>{props.title}</h2><p>{props.description}</p>{props.action}</div>;
}
~~~

Add only the required primitive classes to panel-shell.module.css. Exact shell tokens and responsive behavior are added in later red-green tasks.

- [ ] **Step 6: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm ls lucide-react --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/lib/panel-shell.test.ts \
  apps/customer-panel/components/panel/PanelTopbarChrome.tsx \
  apps/customer-panel/components/panel/PanelPageShell.tsx \
  apps/customer-panel/components/panel/panel-shell.module.css \
  apps/customer-panel/package.json package-lock.json
git commit -m "feat(saas): add hemenaku panel chrome primitives"
~~~

Expected: 85/85 customer-panel tests PASS; typecheck PASS; direct lucide dependency present.

### Task 6: Implement the desktop shell and keep the full TenantContext server-side

**Files:**
- Append tests 3-5: apps/customer-panel/lib/panel-shell.test.ts
- Create: apps/customer-panel/components/panel/PanelLayoutClient.tsx
- Create: apps/customer-panel/components/panel/PanelSidebar.tsx
- Modify: apps/customer-panel/components/panel/PanelShell.tsx:1-65
- Modify: apps/customer-panel/components/panel/PanelNavigation.tsx:1-37
- Modify: apps/customer-panel/app/(panel)/layout.tsx:1-9
- Modify: apps/customer-panel/app/globals.css:1-81 and 275-307; only move shell rules/tokens, preserve catalog/auth rules
- Extend: apps/customer-panel/components/panel/panel-shell.module.css
- Modify narrowly: apps/customer-panel/lib/product-console.test.ts:38-78 and 113-118
- Donor reference: AdminLayoutClient.tsx@fc6c5318:19-175 and 240-584; AdminSidebar.tsx@fc6c5318:60-219 and 252-506

- [ ] **Step 1: Append three failing desktop/security tests**

~~~ts
test("server layout projects TenantContext before entering the client shell", async () => {
  const layout = await source("app/(panel)/layout.tsx");
  const shell = await source("components/panel/PanelShell.tsx");
  const client = await source("components/panel/PanelLayoutClient.tsx");
  assert.match(layout, /createPanelChromeModel\(tenantContext\)/);
  assert.match(layout, /PanelShell model=/);
  assert.doesNotMatch(client, /TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId/);
  assert.doesNotMatch(shell, /tenantContext/);
});

test("desktop shell carries exact donor tokens, widths, topbar, and supported navigation", async () => {
  const css = await source("components/panel/panel-shell.module.css");
  const layout = await source("components/panel/PanelLayoutClient.tsx");
  assert.match(css, /#2A2A2A/i);
  assert.match(css, /#F9F9F9/i);
  assert.match(css, /#FF6A00/i);
  assert.match(css, /15rem/);
  assert.match(css, /15\.5rem/);
  assert.match(css, /16rem/);
  assert.match(css, /min-width:\s*1025px/);
  assert.match(layout, /panel-topbar-actions/);
});

test("logout stays on the existing same-origin JSON mutation", async () => {
  const logout = await source("components/panel/LogoutButton.tsx");
  assert.match(logout, /fetch\(["']\/api\/session\/logout["']/);
  assert.match(logout, /method:\s*["']POST["']/);
  assert.match(logout, /credentials:\s*["']same-origin["']/);
  assert.match(logout, /application\/json/);
  assert.match(logout, /location\.assign\(["']\/login["']\)/);
  assert.doesNotMatch(logout, /document\.cookie|localStorage|sessionStorage/);
});
~~~

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-shell.test.ts
~~~

Expected: 2/5 PASS; three new tests fail because desktop shell/model boundary does not exist.

- [ ] **Step 3: Move projection to the server layout**

Replace layout.tsx lines 1-9 with the same guard plus:

~~~tsx
import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function AuthenticatedPanelLayout({ children }: { children: React.ReactNode }) {
  const { tenantContext } = await requireServerPanelAccess();
  const model = createPanelChromeModel(tenantContext);
  return <PanelShell model={model}>{children}</PanelShell>;
}
~~~

PanelShell becomes a small server-safe composition boundary:

~~~tsx
import type { PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { PanelLayoutClient } from "./PanelLayoutClient";

export function PanelShell(props: { children: React.ReactNode; model: PanelChromeModel }) {
  return <PanelLayoutClient model={props.model}>{props.children}</PanelLayoutClient>;
}
~~~

- [ ] **Step 4: Implement desktop navigation and sidebar**

PanelNavigation must consume PANEL_NAVIGATION and use isPanelNavigationPathActive. Use lucide Home, Package, Plus, Settings icons. Every active link gets aria-current="page"; no startsWith without a slash boundary remains.

PanelSidebar’s desktop core is:

~~~tsx
"use client";

import Link from "next/link";
import type { PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { LogoutButton } from "./LogoutButton";
import { PanelNavigation } from "./PanelNavigation";
import styles from "./panel-shell.module.css";

export function PanelSidebar({ model, mode }: {
  model: PanelChromeModel;
  mode: "desktop" | "drawer";
}) {
  return (
    <aside className={mode === "desktop" ? styles.desktopSidebar : styles.drawer}>
      <Link className={styles.brand} href="/" aria-label="Celebix Panel ana sayfa">
        <span aria-hidden="true">C</span><strong>Celebix</strong>
      </Link>
      <div className={styles.storeIdentity} aria-label="Etkin mağaza">
        <strong>{model.storeSlug}</strong><small>{model.membershipLabel}</small>
      </div>
      <PanelNavigation mode={mode} />
      <div className={styles.sidebarFooter}><LogoutButton /></div>
    </aside>
  );
}
~~~

Drawer props and behavior are added only after their own failing tests in Task 7.

- [ ] **Step 5: Implement desktop client composition and model context**

PanelLayoutClient owns only safe display state:

~~~tsx
"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { PanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { PanelSidebar } from "./PanelSidebar";
import {
  PanelTopbarChromeProvider,
  type PanelTopbarChromeState,
} from "./PanelTopbarChrome";
import styles from "./panel-shell.module.css";

const ModelContext = createContext<PanelChromeModel | null>(null);

export function usePanelChromeModel(): PanelChromeModel {
  const model = useContext(ModelContext);
  if (!model) throw new Error("panel_chrome_model_unavailable");
  return model;
}

export function PanelLayoutClient({ model, children }: { model: PanelChromeModel; children: ReactNode }) {
  const [chrome, setChrome] = useState<PanelTopbarChromeState | null>(null);
  const handleChromeChange = useCallback((next: PanelTopbarChromeState | null) => {
    setChrome((current) => {
      if (!next) return current ? null : current;
      if (current?.title === next.title && current?.subtitle === next.subtitle) return current;
      return { title: next.title, subtitle: next.subtitle };
    });
  }, []);
  return (
    <ModelContext.Provider value={model}>
      <div className={styles.shell}>
        <PanelSidebar model={model} mode="desktop" />
        <div className={styles.workspace}>
          <header className={styles.desktopTopbar}>
            <div><strong>{chrome?.title ?? "Genel bakış"}</strong><span>{chrome?.subtitle}</span></div>
            <div id="panel-topbar-actions" />
          </header>
          <PanelTopbarChromeProvider onChange={handleChromeChange}>
            <main className={styles.content}>{children}</main>
          </PanelTopbarChromeProvider>
        </div>
      </div>
    </ModelContext.Provider>
  );
}
~~~

- [ ] **Step 6: Translate exact donor shell tokens into scoped CSS**

In globals.css, do not replace the root variable block wholesale. Update current lines 3-6 to the pinned donor values, add the panel aliases, and preserve the existing catalog/auth aliases at lines 7-19:

~~~css
:root {
  --hemenaku-orange: #FF6A00;
  --hemenaku-orange-dark: #E85D04;
  --hemenaku-canvas: #F9F9F9;
  --hemenaku-sidebar: #2A2A2A;
  --panel-bg: #F9F9F9;
  --panel-sidebar: #2A2A2A;
  --panel-accent: #FF6A00;
  --panel-accent-hover: #E85D04;
  --panel-accent-soft: #FFF1E8;
  --panel-accent-border: #FFD7BF;
  --panel-touch-target: 48px;
}
~~~

Delete/move only shell selectors from current globals.css lines 34-81 and 275-307. Keep every catalog, form, auth, and product selector unchanged.

In panel-shell.module.css implement:

~~~css
.shell { min-height: 100dvh; background: #F9F9F9; }
.desktopSidebar {
  position: fixed; inset: 0 auto 0 0; z-index: 30;
  display: flex; width: 15rem; flex-direction: column;
  overflow-y: auto; background: #2A2A2A; color: #FFFFFF;
}
.workspace { min-width: 0; min-height: 100dvh; margin-left: 15rem; }
.desktopTopbar {
  position: sticky; top: 0; z-index: 20; display: flex;
  min-height: 4.5rem; align-items: center; justify-content: space-between;
  border-bottom: 1px solid #E3E7EE; background: rgb(249 249 249 / 94%);
  padding: 0 2rem; backdrop-filter: blur(14px);
}
.content { width: 100%; max-width: 100rem; margin-inline: auto; padding: 2rem; }
@media (min-width: 1280px) {
  .desktopSidebar { width: 15.5rem; }
  .workspace { margin-left: 15.5rem; }
}
@media (min-width: 1536px) {
  .desktopSidebar { width: 16rem; }
  .workspace { margin-left: 16rem; }
}
@media (min-width: 1025px) {
  .desktopSidebar, .desktopTopbar { display: flex; }
}
~~~

Add active orange rail, exact icon boxes, row density, white branding, and focus-visible styles from the pinned donor. No Tailwind is added.

- [ ] **Step 7: Narrowly update existing shell source assertions**

In product-console.test.ts lines 38-78 and 113-118:

- assert layout calls createPanelChromeModel and PanelShell receives model;
- assert client files do not contain TenantContext or forbidden authority IDs;
- assert navigation source consumes PANEL_NAVIGATION;
- assert module CSS contains #2A2A2A, #F9F9F9, #FF6A00, and the 1025px boundary;
- preserve all catalog, mutation, server-access, and unsupported-module assertions.

- [ ] **Step 8: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/app/'(panel)'/layout.tsx \
  apps/customer-panel/app/globals.css \
  apps/customer-panel/components/panel/PanelShell.tsx \
  apps/customer-panel/components/panel/PanelNavigation.tsx \
  apps/customer-panel/components/panel/PanelLayoutClient.tsx \
  apps/customer-panel/components/panel/PanelSidebar.tsx \
  apps/customer-panel/components/panel/panel-shell.module.css \
  apps/customer-panel/lib/panel-shell.test.ts \
  apps/customer-panel/lib/product-console.test.ts
git commit -m "feat(saas): adopt hemenaku desktop merchant shell"
~~~

Expected: 88/88 customer-panel tests PASS; typecheck/build PASS.

### Task 7: Implement the mobile drawer, dock, focus, swipe, safe-area, and keyboard inset

**Files:**
- Append tests 6-7: apps/customer-panel/lib/panel-shell.test.ts
- Create: apps/customer-panel/components/panel/PanelMobileDock.tsx
- Modify: apps/customer-panel/components/panel/PanelLayoutClient.tsx
- Modify: apps/customer-panel/components/panel/PanelSidebar.tsx
- Modify: apps/customer-panel/components/panel/panel-shell.module.css
- Donor reference: AdminLayoutClient.tsx@fc6c5318:176-238 and 240-649; AdminSidebar.tsx@fc6c5318:507-997

- [ ] **Step 1: Append two failing mobile/accessibility tests**

~~~ts
test("mobile drawer has dialog, Escape, backdrop, focus-return, and swipe-close behavior", async () => {
  const sidebar = await source("components/panel/PanelSidebar.tsx");
  const layout = await source("components/panel/PanelLayoutClient.tsx");
  assert.match(sidebar, /role="dialog"/);
  assert.match(sidebar, /aria-modal="true"/);
  assert.match(sidebar, /Escape/);
  assert.match(sidebar, /onTouchStart/);
  assert.match(sidebar, /onTouchMove/);
  assert.match(sidebar, /onTouchEnd/);
  assert.match(sidebar, /\.focus\(\)/);
  assert.match(layout, /document\.body\.style\.overflow/);
});

test("mobile dock is exact, safe-area aware, 48px, reduced-motion, and breakpoint-correct", async () => {
  const dock = await source("components/panel/PanelMobileDock.tsx");
  const css = await source("components/panel/panel-shell.module.css");
  assert.match(dock, /label:\s*"Ana"/);
  assert.match(dock, /label:\s*"Ürünler"/);
  assert.match(dock, />Menü<\/span>/);
  assert.doesNotMatch(dock, /Sipariş|Toshi|Müşteri|Bildirim/);
  assert.match(css, /max-width:\s*1024px/);
  assert.match(css, /min-width:\s*1025px/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /--panel-keyboard-inset/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
~~~

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-shell.test.ts
~~~

Expected: 5/7 PASS; both mobile tests fail.

- [ ] **Step 3: Implement the exact three-item dock**

PanelMobileDock.tsx:

~~~tsx
"use client";

import { Home, Menu, Package } from "lucide-react";
import Link from "next/link";
import type { RefObject } from "react";
import { isPanelNavigationPathActive } from "@/lib/panel-ui/navigation";
import styles from "./panel-shell.module.css";

export function PanelMobileDock(props: {
  pathname: string;
  menuOpen: boolean;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onMenuToggle: () => void;
}) {
  const items = [
    { href: "/" as const, label: "Ana", Icon: Home },
    { href: "/products" as const, label: "Ürünler", Icon: Package },
  ];
  return (
    <nav className={styles.mobileDock} aria-label="Mobil panel menüsü">
      {items.map(({ href, label, Icon }) => {
        const active = isPanelNavigationPathActive(props.pathname, href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></Link>;
      })}
      <button
        ref={props.menuButtonRef}
        type="button"
        aria-label="Panel menüsünü aç"
        aria-controls="panel-mobile-drawer"
        aria-expanded={props.menuOpen}
        onClick={props.onMenuToggle}
      ><Menu aria-hidden="true" /><span>Menü</span></button>
    </nav>
  );
}
~~~

- [ ] **Step 4: Add drawer interaction without client authority**

PanelSidebar drawer branch must:

- render backdrop as a button that calls onClose;
- render aside id="panel-mobile-drawer", role="dialog", aria-modal="true";
- focus its close button on open and return focus to triggerRef on cleanup;
- close on Escape;
- record touch start/move and close only for a rightward swipe of at least 64px;
- call onClose after navigation;
- contain exactly the shared PANEL_NAVIGATION and existing LogoutButton.

Minimal interaction core:

~~~tsx
const closeRef = useRef<HTMLButtonElement>(null);
const touchStart = useRef<number | null>(null);
const touchCurrent = useRef<number | null>(null);

useEffect(() => {
  if (mode !== "drawer" || !open) return;
  closeRef.current?.focus();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") onClose?.();
  };
  window.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    triggerRef?.current?.focus();
  };
}, [mode, onClose, open, triggerRef]);

function finishSwipe() {
  if (
    touchStart.current !== null &&
    touchCurrent.current !== null &&
    touchCurrent.current - touchStart.current >= 64
  ) onClose?.();
  touchStart.current = null;
  touchCurrent.current = null;
}
~~~

- [ ] **Step 5: Add body lock and visual-viewport keyboard inset**

PanelLayoutClient adds drawerOpen, menuButtonRef, usePathname, and:

~~~tsx
useEffect(() => {
  if (!drawerOpen) return;
  const previous = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => { document.body.style.overflow = previous; };
}, [drawerOpen]);

useEffect(() => {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const sync = () => {
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty("--panel-keyboard-inset", String(inset) + "px");
  };
  sync();
  viewport.addEventListener("resize", sync);
  viewport.addEventListener("scroll", sync);
  return () => {
    viewport.removeEventListener("resize", sync);
    viewport.removeEventListener("scroll", sync);
    document.documentElement.style.removeProperty("--panel-keyboard-inset");
  };
}, []);
~~~

Render drawer and dock only as mobile interaction surfaces. CSS controls visibility; neither surface decides tenant authority.

- [ ] **Step 6: Add exact responsive/accessibility CSS**

~~~css
.mobileDock, .drawerSurface, .drawerBackdrop { display: none; }
@media (max-width: 1024px) {
  .desktopSidebar, .desktopTopbar { display: none; }
  .workspace { margin-left: 0; }
  .content {
    padding: 1.25rem 1rem calc(5.25rem + env(safe-area-inset-bottom, 0px) + var(--panel-keyboard-inset, 0px));
  }
  .mobileDock {
    position: fixed; inset: auto 0 0; z-index: 40; display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: .375rem .75rem calc(.375rem + env(safe-area-inset-bottom, 0px));
    border-top: 1px solid #E3E7EE; background: rgb(255 255 255 / 96%);
  }
  .mobileDock a, .mobileDock button { min-width: 48px; min-height: 48px; }
  .drawerBackdrop { position: fixed; inset: 0; z-index: 49; display: block; background: rgb(0 0 0 / 45%); }
  .drawerSurface {
    position: fixed; inset: 0 0 0 auto; z-index: 50; display: flex;
    width: min(22rem, 88vw); flex-direction: column; background: #2A2A2A;
    padding: calc(1rem + env(safe-area-inset-top, 0px)) 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    transform: translateX(0); transition: transform 180ms ease;
  }
}
@media (min-width: 1025px) {
  .mobileDock, .drawerSurface, .drawerBackdrop { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .drawerSurface, .mobileDock, .mobileDock * { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
~~~

- [ ] **Step 7: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/components/panel/PanelMobileDock.tsx \
  apps/customer-panel/components/panel/PanelLayoutClient.tsx \
  apps/customer-panel/components/panel/PanelSidebar.tsx \
  apps/customer-panel/components/panel/panel-shell.module.css \
  apps/customer-panel/lib/panel-shell.test.ts
git commit -m "feat(saas): add responsive merchant navigation"
~~~

Expected: 90/90 customer-panel tests PASS; typecheck/build PASS.

### Task 8: Render the truthful Hemenaku-style dashboard

**Files:**
- Append test 8: apps/customer-panel/lib/panel-shell.test.ts
- Create: apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx
- Create: apps/customer-panel/components/dashboard/panel-dashboard.module.css
- Modify: apps/customer-panel/app/(panel)/page.tsx:1-18
- Donor geometry reference: DashboardHomeView.tsx@fc6c5318:313-478, 592-689, and 1505-1578

- [ ] **Step 1: Append the final failing source test**

~~~ts
test("dashboard renders only the safe chrome model and truthful working actions", async () => {
  const page = await source("app/(panel)/page.tsx");
  const view = await source("components/dashboard/PanelDashboardHomeView.tsx");
  const model = await source("lib/panel-ui/dashboard-model.ts");
  const combined = view + "\n" + model;
  assert.match(page, /PanelDashboardHomeView/);
  assert.match(view, /usePanelChromeModel/);
  assert.match(view, /createPanelDashboardModel/);
  assert.match(combined, /\/products/);
  assert.match(combined, /\/products\/new/);
  assert.match(combined, /\/setup/);
  assert.doesNotMatch(view, /TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId/);
  assert.doesNotMatch(combined, /revenue|ciro|order|sipariş|conversion|dönüşüm|analytics|Toshi/i);
});
~~~

- [ ] **Step 2: Run RED**

~~~bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-shell.test.ts
~~~

Expected: 7/8 PASS; dashboard test fails because the view does not exist.

- [ ] **Step 3: Implement the safe-model dashboard**

PanelDashboardHomeView.tsx:

~~~tsx
"use client";

import { PanelActionButton, PanelMetricCard, PanelPageHeader, PanelPageShell, PanelPanel } from "@/components/panel/PanelPageShell";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import { createPanelDashboardModel } from "@/lib/panel-ui/dashboard-model";
import styles from "./panel-dashboard.module.css";

export function PanelDashboardHomeView() {
  const dashboard = createPanelDashboardModel(usePanelChromeModel());
  return (
    <PanelPageShell>
      <PanelPageHeader
        title={dashboard.title}
        description={dashboard.description}
        actions={<PanelActionButton href="/products/new" primary>Yeni ürün</PanelActionButton>}
      />
      <div className={styles.cardGrid}>
        {dashboard.cards.map((card) => (
          <PanelMetricCard
            key={card.key}
            label={card.label}
            value={card.value}
            detail={card.detail ?? card.status}
          />
        ))}
      </div>
      <PanelPanel title="Hızlı işlemler">
        <div className={styles.actionRail}>
          {dashboard.actions.map((action) => (
            <PanelActionButton key={action.href} href={action.href}>{action.label}</PanelActionButton>
          ))}
        </div>
      </PanelPanel>
    </PanelPageShell>
  );
}
~~~

page.tsx becomes:

~~~tsx
import { PanelDashboardHomeView } from "@/components/dashboard/PanelDashboardHomeView";

export default function PanelHomePage() {
  return <PanelDashboardHomeView />;
}
~~~

The view consumes only the safe model already projected by the guarded server layout. It performs no second session lookup and sends no tenant authority to an API.

- [ ] **Step 4: Implement dashboard geometry only**

panel-dashboard.module.css uses donor card/grid geometry, not donor data:

~~~css
.cardGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
.actionRail { display: flex; flex-wrap: wrap; gap: .75rem; }
@media (max-width: 1280px) { .cardGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .cardGrid { grid-template-columns: 1fr; } .actionRail { display: grid; } }
~~~

Card radius, border, shadow, heading density, and spacing come from the pinned donor within the design tolerance. Do not add numeric metric cards, charts, refresh ranges, or analytics endpoints.

- [ ] **Step 5: Run GREEN and commit**

~~~bash
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
git diff --check
git add apps/customer-panel/app/'(panel)'/page.tsx \
  apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx \
  apps/customer-panel/components/dashboard/panel-dashboard.module.css \
  apps/customer-panel/lib/panel-shell.test.ts
git commit -m "feat(saas): render truthful merchant dashboard"
~~~

Expected: 91/91 customer-panel tests PASS; typecheck/build PASS.

### Task 9: Lock security, donor immutability, and integration contracts

**Files:**
- Create: tests/saas-phase3/hemenaku-merchant-shell/static-security.test.mjs; exactly 8 tests
- Create: tests/saas-phase3/hemenaku-merchant-shell/in-process.test.mjs; exactly 5 tests
- Read-only verify: apps/admin/**
- Read-only verify: deploy/** and production configuration

- [ ] **Step 1: Write eight static-security tests**

The complete static-security.test.mjs must use:

~~~js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "d020e96c6a7e5336e64d586683985fd6bf4f354e";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

test("pins the exact donor commit and required donor files", () => {
  assert.equal(git("rev-parse", DONOR + "^{commit}"), DONOR);
  for (const path of [
    "apps/admin/app/globals.css",
    "apps/admin/app/admin/AdminLayoutClient.tsx",
    "apps/admin/components/admin/AdminSidebar.tsx",
    "apps/admin/components/admin/AdminTopbarChrome.tsx",
    "apps/admin/components/admin/AdminPageShell.tsx",
    "apps/admin/components/admin/dashboard/DashboardHomeView.tsx",
  ]) assert.doesNotThrow(() => git("cat-file", "-e", DONOR + ":" + path));
});

test("keeps apps admin byte-unchanged from the implementation base", () => {
  assert.equal(git("diff", "--name-only", BASE + "...HEAD", "--", "apps/admin"), "");
});

test("never sends full TenantContext or authority identifiers into client modules", async () => {
  const combined = (await Promise.all([
    "apps/customer-panel/components/panel/PanelLayoutClient.tsx",
    "apps/customer-panel/components/panel/PanelSidebar.tsx",
    "apps/customer-panel/components/panel/PanelNavigation.tsx",
    "apps/customer-panel/components/panel/PanelMobileDock.tsx",
    "apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx",
  ].map(read))).join("\n");
  assert.doesNotMatch(combined, /TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId/);
});

test("imports no donor auth data runtime or legacy admin API", async () => {
  const files = git("diff", "--name-only", BASE + "...HEAD", "--", "apps/customer-panel").split("\n").filter(Boolean);
  const implementation = files.filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.[cm]?[jt]sx?$/.test(file));
  const combined = (await Promise.all(implementation.map(read))).join("\n");
  assert.doesNotMatch(combined, /@supabase|getAdminAuthContext|getBrowserSupabaseClient|NEXT_PUBLIC_ADMIN_AUTH_PROVIDER|\/api\/admin\/|store-runtime|store-info-context/i);
});

test("contains no unsupported navigation or dashboard claims", async () => {
  const combined = (await Promise.all([
    "apps/customer-panel/lib/panel-ui/navigation.ts",
    "apps/customer-panel/lib/panel-ui/dashboard-model.ts",
    "apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx",
  ].map(read))).join("\n");
  assert.doesNotMatch(combined, /orders|sipariş|customers|müşteri|marketing|cms|accounting|muhasebe|seo|toshi|notification|revenue|ciro|conversion|analytics/i);
});

test("preserves exact same-origin logout semantics", async () => {
  const logout = await read("apps/customer-panel/components/panel/LogoutButton.tsx");
  assert.match(logout, /\/api\/session\/logout/);
  assert.match(logout, /method:\s*["']POST["']/);
  assert.match(logout, /credentials:\s*["']same-origin["']/);
  assert.doesNotMatch(logout, /document\.cookie|localStorage|sessionStorage/);
});

test("adds only the direct lucide dependency and nested panel ui test glob", async () => {
  const pkg = JSON.parse(await read("apps/customer-panel/package.json"));
  assert.match(pkg.dependencies["lucide-react"], /^\^0\.563\./);
  assert.equal(pkg.scripts.test, "node --experimental-transform-types --test lib/*.test.ts lib/panel-ui/*.test.ts");
});

test("does not change deploy production or infrastructure files", () => {
  const changed = git("diff", "--name-only", BASE + "...HEAD").split("\n").filter(Boolean);
  assert.equal(changed.some((path) => /^(deploy|infra|infrastructure|apps\/admin)\//.test(path)), false);
});
~~~

- [ ] **Step 2: Write five in-process model-composition tests**

in-process.test.mjs imports the three pure TypeScript models and uses one genuine TenantContext fixture. Its five test names and assertions are:

~~~js
import assert from "node:assert/strict";
import test from "node:test";
import { createPanelChromeModel } from "../../../apps/customer-panel/lib/panel-ui/chrome-model.ts";
import { createPanelDashboardModel } from "../../../apps/customer-panel/lib/panel-ui/dashboard-model.ts";
import { PANEL_NAVIGATION, isPanelNavigationPathActive } from "../../../apps/customer-panel/lib/panel-ui/navigation.ts";

const tenant = {
  schemaVersion: 1,
  requestId: "90000000-0000-4000-8000-000000000001",
  principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.example/oidc", subject: "subject" },
  store: { id: "20000000-0000-4000-8000-000000000001", slug: "pilot-store", status: "active" },
  membership: { id: "30000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" },
  entitlements: {
    schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000001",
    planCode: "free_starter", version: 1, status: "active",
    features: ["catalog"], limits: { products: 100, staff: 1, storageBytes: 1_000_000 },
    validFrom: "2026-07-19T00:00:00.000Z",
  },
  locale: "tr-TR",
};

test("composes durable context into truthful dashboard without authority IDs", () => {
  const dashboard = createPanelDashboardModel(createPanelChromeModel(tenant));
  assert.equal(dashboard.cards[0].value, "pilot-store");
  assert.doesNotMatch(JSON.stringify(dashboard), /10000000|20000000|30000000|40000000|issuer|subject/);
});

test("keeps every dashboard action inside supported navigation", () => {
  const dashboard = createPanelDashboardModel(createPanelChromeModel(tenant));
  const hrefs = new Set(PANEL_NAVIGATION.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]));
  assert.equal(dashboard.actions.every((action) => hrefs.has(action.href)), true);
});

test("rejects cross-store resolved-host composition", () => {
  const unsafe = { ...tenant, resolvedHost: {
    schemaVersion: 1, hostname: "other.celebix.site", domainId: "50000000-0000-4000-8000-000000000001",
    domainType: "platform_subdomain", storeId: "60000000-0000-4000-8000-000000000001",
    storeSlug: "other", canonicalHostname: "other.celebix.site", status: "active", cacheVersion: 1,
  } };
  assert.throws(() => createPanelChromeModel(unsafe), /panel_chrome_context_invalid/);
});

test("rejects navigation near matches in process", () => {
  assert.equal(isPanelNavigationPathActive("/products-evil", "/products"), false);
  assert.equal(isPanelNavigationPathActive("/products/new", "/products"), true);
});

test("freezes every public presentation boundary", () => {
  const chrome = createPanelChromeModel(tenant);
  const dashboard = createPanelDashboardModel(chrome);
  assert.equal(Object.isFrozen(chrome), true);
  assert.equal(Object.isFrozen(dashboard), true);
  assert.equal(Object.isFrozen(PANEL_NAVIGATION), true);
});
~~~

- [ ] **Step 3: Run RED before adding the implementation tests to the commit**

Run static tests once immediately after creating them but before correcting any discovered issue:

~~~bash
node --experimental-transform-types --test tests/saas-phase3/hemenaku-merchant-shell/*.test.mjs
~~~

Expected on a correct Tasks 1-8 implementation: 13/13 PASS. If a test fails, treat that as RED evidence, change only the implicated already-authorized implementation file, then rerun. Never weaken a denylist to make a real forbidden import pass.

- [ ] **Step 4: Run GREEN and commit**

~~~bash
node --experimental-transform-types --test tests/saas-phase3/hemenaku-merchant-shell/*.test.mjs
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
git diff --check
git add tests/saas-phase3/hemenaku-merchant-shell
git commit -m "test(saas): lock merchant shell security and parity"
~~~

Expected: merchant-shell tests 13/13 PASS; customer-panel 91/91 PASS.

### Task 10: Full local regression, accessibility, dependency, secret, and scope gates

**Files:** No intended tracked changes.

- [ ] **Step 1: Reinstall exactly and verify dependency churn**

~~~bash
npm ci --include=optional --no-audit --no-fund
npm ls lucide-react --workspace @celebix/customer-panel
git diff d020e96c6a7e5336e64d586683985fd6bf4f354e...HEAD -- \
  apps/customer-panel/package.json package-lock.json
~~~

Expected: npm ci PASS; lucide-react is one direct customer-panel runtime dependency; no unrelated dependency version changes.

- [ ] **Step 2: Run exact customer-panel and shared-domain totals**

~~~bash
npm test --workspace @celebix/customer-panel
node --experimental-transform-types --test tests/saas-phase3/hemenaku-merchant-shell/*.test.mjs
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
~~~

Expected:

- customer-panel 91/91 PASS;
- merchant shell 13/13 PASS;
- saas-contracts 23/23 PASS;
- saas-data 58/58 PASS.

- [ ] **Step 3: Run customer-panel and Owner compile/build regressions**

~~~bash
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
~~~

Expected: all four commands PASS.

The Owner workspace has no test script at the approved base. Do not invent or add one in this UI task. The separately existing npm run test:saas-phase1 baseline is 4/5 because phase1-flow.test.ts imports the already-removed SELF_SERVE_SAAS_REGISTRATION_ENABLED export; that unrelated test is outside this task’s authorized repair. Record it as unchanged baseline evidence if Atlas asks, but do not alter Owner, Phase 1, or scope to hide it.

- [ ] **Step 4: Verify catalog/session implementation remains untouched**

~~~bash
git diff --exit-code d020e96c6a7e5336e64d586683985fd6bf4f354e...HEAD -- \
  apps/customer-panel/lib/catalog-http \
  apps/customer-panel/lib/catalog-ui \
  apps/customer-panel/lib/server-panel-access \
  apps/customer-panel/lib/server-panel-session-controls \
  apps/customer-panel/app/api
~~~

Expected: empty diff. The authorized apps/customer-panel/lib/routes.test.ts change is not under these implementation paths.

- [ ] **Step 5: Run donor, scope, secret, and forbidden-ID scans**

~~~bash
test -z "$(git diff --name-only d020e96c6a7e5336e64d586683985fd6bf4f354e...HEAD -- apps/admin)"
test -z "$(git diff --name-only d020e96c6a7e5336e64d586683985fd6bf4f354e...HEAD -- deploy infra infrastructure)"

unexpected="$(
  git diff --name-only d020e96c6a7e5336e64d586683985fd6bf4f354e...HEAD |
  while IFS= read -r file; do
    case "$file" in
      "apps/customer-panel/app/(panel)/layout.tsx" | \
      "apps/customer-panel/app/(panel)/page.tsx" | \
      "apps/customer-panel/app/globals.css" | \
      "apps/customer-panel/package.json" | \
      "package-lock.json" | \
      apps/customer-panel/components/panel/* | \
      apps/customer-panel/components/dashboard/* | \
      apps/customer-panel/lib/panel-ui/* | \
      "apps/customer-panel/lib/panel-shell.test.ts" | \
      "apps/customer-panel/lib/product-console.test.ts" | \
      "apps/customer-panel/lib/routes.test.ts" | \
      tests/saas-phase3/hemenaku-merchant-shell/*) ;;
      *) printf '%s\n' "$file" ;;
    esac
  done
)"
test -z "$unexpected"

if git diff --unified=0 d020e96c6a7e5336e64d586683985fd6bf4f354e...HEAD | \
  rg -n 'postgres(ql)?://[^[:space:]]+:[^@[:space:]]+@|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|__Host-celebix_panel=[^;[:space:]]+|pb1\.[A-Za-z0-9_-]{20,}|bs1\.[A-Za-z0-9_-]{20,}|h1\.[A-Za-z0-9_-]{20,}'
then
  echo "tracked diff contains a secret-shaped value" >&2
  exit 1
fi

if rg -n 'TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId' \
  apps/customer-panel/components/panel/PanelLayoutClient.tsx \
  apps/customer-panel/components/panel/PanelSidebar.tsx \
  apps/customer-panel/components/panel/PanelNavigation.tsx \
  apps/customer-panel/components/panel/PanelMobileDock.tsx \
  apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx
then
  echo "client shell contains forbidden authority fields" >&2
  exit 1
fi

git diff --check
git status --short
~~~

Expected: all scans have zero matches; diff check PASS; worktree clean after commits.

- [ ] **Step 6: Perform local accessibility checks before any staging request**

Start only the local customer-panel with a disposable/local approved session fixture supplied by the implementation task. In Chrome DevTools Accessibility tree and keyboard navigation, prove:

1. Skip through every interactive item by keyboard; focus is visible.
2. Active route exposes aria-current="page".
3. Menu button exposes aria-controls and aria-expanded.
4. Open drawer exposes role="dialog" and aria-modal="true".
5. Escape, backdrop, close button, and rightward swipe close the drawer.
6. Closing returns focus to Menu.
7. Every measured dock/drawer control is at least 48x48 CSS pixels.
8. Computed color pairs meet WCAG AA; record values, not a visual guess.
9. With prefers-reduced-motion enabled, transition duration computes to .01ms.
10. At 320px there is no documentElement horizontal overflow.

Expected: all ten checks PASS. Do not add axe or another dependency; the approved dependency surface is lucide-react only.

### Task 11: Separately authorized isolated-staging visual and browser gate

**Files:** No source changes. Screenshot artifacts remain untracked.

- [ ] **Step 1: Stop unless a new Atlas task explicitly authorizes staging**

Before any deploy, require written authorization naming:

- exact implementation SHA;
- isolated customer-panel staging service;
- permitted staging session fixture/credential handling;
- donor read-only access;
- production NO-GO.

Without it, stop with:

~~~text
STAGING_DEPLOYMENT_NOT_AUTHORIZED
~~~

- [ ] **Step 2: Deploy exact SHA only after authorization**

Deploy only customer-panel isolated staging from the exact reviewed SHA. Do not deploy Owner for parity, do not mutate production, and do not rotate production credentials. Verify the runtime reports the exact SHA before browser work.

- [ ] **Step 3: Capture the exact screenshot matrix**

Store untracked images under .codex-artifacts/hemenaku-shell/<exact-sha>/ using these exact names:

| Target | Viewport | Artifact |
|---|---:|---|
| Dashboard desktop | 1440x1024 | target-dashboard-1440x1024.png |
| Products loaded | 1440x1024 | target-products-loaded-1440x1024.png |
| Products empty fixture | 1440x1024 | target-products-empty-1440x1024.png |
| Products controlled error fixture | 1440x1024 | target-products-error-1440x1024.png |
| Dashboard mobile boundary | 1024x768 | target-dashboard-1024x768.png |
| Dashboard desktop boundary | 1025x768 | target-dashboard-1025x768.png |
| Dashboard mobile | 390x844 | target-dashboard-390x844.png |
| Products mobile loaded | 390x844 | target-products-390x844.png |
| Drawer open, Products active | 390x844 | target-drawer-products-390x844.png |
| Narrow mobile | 320x720 | target-dashboard-320x720.png |

Capture donor dashboard/products references from the authorized read-only Hemenaku session at 1440x1024, 1025x768, 1024x768, 390x844, and 320x720. Never submit a form or mutate donor data.

- [ ] **Step 4: Apply quantitative visual acceptance**

For every comparable screenshot, record:

- exact #2A2A2A sidebar, #F9F9F9 canvas, #FF6A00 accent;
- sidebar width/topbar height/content padding within 2px;
- radius within 2px;
- font weight exact and font size within 1px;
- 1024 mobile and 1025 desktop boundary exact;
- no horizontal page scroll at 320, 390, 768, 1024, 1025, and 1440 widths;
- no unsupported label/href in DOM;
- deliberate missing donor modules are not counted as parity failures.

- [ ] **Step 5: Complete authorized browser security flows**

With a fresh genuine staging panel session:

1. Dashboard shows only exact store slug, role label, plan/version, and durable hostname.
2. Products, New Product, and Setup navigate and retain correct active state.
3. /products-evil never activates Products.
4. Drawer closes by Escape/backdrop/close/swipe and returns focus.
5. Bottom dock never obscures content or an input under visual viewport changes.
6. Logout posts to /api/session/logout and the next guarded / request redirects to login.
7. Missing, malformed, expired, and revoked sessions render no shell or projection.
8. DOM, RSC payload, network request bodies, console, and runtime logs contain no raw cookie, token, connection string, principal/store/membership/plan/domain ID, issuer, or subject.

Expected: all eight flows PASS, production changes 0, Owner deployments 0.

## Final Definition of Done

- All nine small implementation commits exist in order and contain only their declared files.
- apps/admin diff from d020e96c... is empty and donor SHA fc6c5318... is reverified.
- Customer-panel is 91/91, merchant-shell is 13/13, contracts are 23/23, and data is 58/58.
- Customer-panel and Owner typecheck/build all pass.
- Full TenantContext and forbidden IDs never enter a client component or browser payload.
- Navigation contains only /, /products, /products/new, and /setup and rejects near matches.
- Desktop, drawer, dock, truthful dashboard, accessibility, dependency, secret, and scope gates pass.
- apps/customer-panel/lib/routes.test.ts changes only the two authorized stale route-export assertions; route implementation remains unchanged.
- Staging visual/E2E evidence exists only if separately authorized.
- Production deploy/config/credentials/data mutations are exactly zero.
