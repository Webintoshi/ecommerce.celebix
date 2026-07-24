# Toshi Local Store Assistant Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static “Bana Sorun” help popover with the real Toshi profile, an accessible assistant drawer, a server-authorized `/toshi` workspace, and useful API-free store/order/product/customer commands backed only by existing same-origin durable APIs.

**Architecture:** A finite local intent parser converts bounded Turkish commands into a closed command union. A browser client executes only reviewed same-origin read APIs that independently authenticate the persistent panel session and never accepts tenant/store authority. The shared Toshi workspace renders the same conversation model in the topbar drawer and the `/toshi` page; provider-backed reasoning and durable write confirmations remain separate later plans.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, CSS Modules, lucide-react, Node test runner, existing Celebix catalog/order/customer/analytics HTTP contracts.

## Global Constraints

- Target only `apps/customer-panel` and its existing Phase 3 browser fixture/tests in this plan.
- Preserve all current uncommitted merchant-shell work; do not reset, stash, discard, amend, or rewrite it.
- `apps/admin/**` remains byte-for-byte unchanged.
- Toshi receives no browser tenant/store/principal/membership/plan authority.
- API-free mode performs only reviewed read commands and safe navigation; no mutation is introduced in this plan.
- Every Toshi network request uses exact same-origin relative paths with `credentials: "same-origin"`.
- No fake KPI, customer, product, order, conversation, or provider response is rendered in production code.
- The supplied profile image is copied exactly to `apps/customer-panel/public/toshi/toshi-profile.webp`.
- No provider key, OpenAI dependency, migration, deployment, production connection, or credential change is authorized by this plan.
- Desktop drawer, mobile full-screen surface, Escape/backdrop/close/focus return, 48×48 targets, zero horizontal overflow, and reduced-motion behavior are mandatory.

---

## File Map

- `apps/customer-panel/public/toshi/toshi-profile.webp` — immutable supplied Toshi identity asset.
- `apps/customer-panel/lib/toshi-local/types.ts` — closed local intent, response, source, and error contracts.
- `apps/customer-panel/lib/toshi-local/intent.ts` — finite Turkish command parser with ambiguity denial.
- `apps/customer-panel/lib/toshi-local/response.ts` — deterministic truthful response projector.
- `apps/customer-panel/lib/toshi-local/client.ts` — same-origin API reader and command executor.
- `apps/customer-panel/lib/toshi-local.test.ts` — parser, client, projection, security, and source tests.
- `apps/customer-panel/components/toshi/ToshiAssistant.tsx` — shared conversation state and form.
- `apps/customer-panel/components/toshi/ToshiDrawer.tsx` — accessible topbar drawer.
- `apps/customer-panel/components/toshi/ToshiWorkspace.tsx` — full `/toshi` presentation.
- `apps/customer-panel/components/toshi/toshi.module.css` — responsive drawer/workspace styling.
- `apps/customer-panel/components/panel/PanelTopbarUtilities.tsx:1-72` — real Toshi launcher.
- `apps/customer-panel/components/panel/panel-shell.module.css:121-260` — launcher/avatar integration only.
- `apps/customer-panel/app/toshi/page.tsx` — server-authorized Toshi page.
- `apps/customer-panel/lib/panel-ui/navigation.ts:1-340` — exact `/toshi` route title and navigation contract.
- `apps/customer-panel/lib/panel-shell.test.ts` — launcher, focus, image, navigation, and geometry source tests.
- `tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/toshi/page.tsx` — local browser fixture route.
- `tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/[...slug]/route.ts` — reviewed Toshi read fixtures.
- `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs` — no-authority/no-secret scan.

---

### Task 1: Pin the Toshi identity and launcher contract

**Files:**
- Create: `apps/customer-panel/public/toshi/toshi-profile.webp`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts:720-940`
- Modify: `apps/customer-panel/components/panel/PanelTopbarUtilities.tsx:1-72`
- Modify: `apps/customer-panel/components/panel/panel-shell.module.css:161-200`

**Interfaces:**
- Consumes: supplied `/Users/Celebix/Desktop/toshi-profile.webp`.
- Produces: `PanelTopbarUtilities` launcher with `aria-controls="toshi-assistant-drawer"` and the exact local image `/toshi/toshi-profile.webp`.

- [ ] **Step 1: Write the failing launcher test**

Add assertions to `panel-shell.test.ts`:

```ts
test("topbar launches the real Toshi identity without a remote or generated avatar", async () => {
  const source = await read("components/panel/PanelTopbarUtilities.tsx");
  assert.match(source, /src="\/toshi\/toshi-profile[.]webp"/);
  assert.match(source, /alt="Toshi yapay zekâ mağaza asistanı"/);
  assert.match(source, /aria-controls="toshi-assistant-drawer"/);
  assert.match(source, /<ToshiDrawer/);
  assert.doesNotMatch(source, /<Bot\b|https?:\/\//);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --experimental-transform-types --test --test-name-pattern="real Toshi identity" apps/customer-panel/lib/panel-shell.test.ts
```

Expected: FAIL because `toshi-profile.webp` and `ToshiDrawer` are not referenced.

- [ ] **Step 3: Copy the exact image and implement the minimal launcher**

Copy the supplied binary without conversion and verify its digest:

```bash
mkdir -p apps/customer-panel/public/toshi
cp /Users/Celebix/Desktop/toshi-profile.webp apps/customer-panel/public/toshi/toshi-profile.webp
cmp /Users/Celebix/Desktop/toshi-profile.webp apps/customer-panel/public/toshi/toshi-profile.webp
```

Replace the bot glyph inside `PanelTopbarUtilities` with:

```tsx
<button
  ref={helpButtonRef}
  className={styles.topbarAssistantButton}
  type="button"
  aria-expanded={helpOpen}
  aria-controls="toshi-assistant-drawer"
  onClick={() => setHelpOpen((current) => !current)}
>
  <span>Bana Sorun</span>
  <span className={styles.topbarAssistantAvatar}>
    <Image
      src="/toshi/toshi-profile.webp"
      width={48}
      height={48}
      alt="Toshi yapay zekâ mağaza asistanı"
      priority
    />
  </span>
</button>
<ToshiDrawer
  open={helpOpen}
  launcherRef={helpButtonRef}
  onClose={() => setHelpOpen(false)}
/>
```

Use `next/image`, remove `Bot`, and let `ToshiDrawer` own close/focus behavior.

- [ ] **Step 4: Run focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the identity slice**

```bash
git add apps/customer-panel/public/toshi/toshi-profile.webp \
  apps/customer-panel/components/panel/PanelTopbarUtilities.tsx \
  apps/customer-panel/components/panel/panel-shell.module.css \
  apps/customer-panel/lib/panel-shell.test.ts
git commit -m "feat(customer-panel): add toshi assistant identity"
```

---

### Task 2: Build the finite API-free intent contract

**Files:**
- Create: `apps/customer-panel/lib/toshi-local/types.ts`
- Create: `apps/customer-panel/lib/toshi-local/intent.ts`
- Create: `apps/customer-panel/lib/toshi-local/response.ts`
- Create: `apps/customer-panel/lib/toshi-local.test.ts`

**Interfaces:**
- Produces: `parseToshiLocalIntent(input: unknown): ToshiLocalIntent`.
- Produces: `projectToshiLocalReply(intent, payload): ToshiLocalReply`.
- `ToshiLocalIntent` is exactly:

```ts
type ToshiLocalIntent =
  | { readonly kind: "store_summary" }
  | { readonly kind: "pending_orders" }
  | { readonly kind: "low_stock" }
  | { readonly kind: "find_order"; readonly query: string }
  | { readonly kind: "find_customer"; readonly query: string }
  | { readonly kind: "find_product"; readonly query: string }
  | { readonly kind: "navigate"; readonly destination: ToshiDestination }
  | { readonly kind: "unsupported" };
```

- [ ] **Step 1: Write failing parser and projection tests**

Create `toshi-local.test.ts` with table tests for:

```ts
assert.deepEqual(parseToshiLocalIntent("mağaza özeti"), { kind: "store_summary" });
assert.deepEqual(parseToshiLocalIntent("bekleyen siparişler"), { kind: "pending_orders" });
assert.deepEqual(parseToshiLocalIntent("düşük stok"), { kind: "low_stock" });
assert.deepEqual(parseToshiLocalIntent("müşteri bul Ada"), { kind: "find_customer", query: "Ada" });
assert.deepEqual(parseToshiLocalIntent("ürün ara KG-M-KREM"), { kind: "find_product", query: "KG-M-KREM" });
assert.deepEqual(parseToshiLocalIntent("sipariş bul CBX-1042"), { kind: "find_order", query: "CBX-1042" });
assert.deepEqual(parseToshiLocalIntent("ürünlere git"), { kind: "navigate", destination: "/products" });
```

Also assert that empty, over-500-character, control-character, ambiguous mixed commands,
mutation commands, API-key requests, and unknown commands return `{ kind: "unsupported" }`.

- [ ] **Step 2: Run parser tests and verify RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/toshi-local.test.ts
```

Expected: FAIL with missing `./toshi-local/intent.ts`.

- [ ] **Step 3: Implement the minimal closed parser**

Implement exact normalization and ordered patterns. The parser must:

```ts
export function parseToshiLocalIntent(input: unknown): ToshiLocalIntent {
  if (typeof input !== "string" || input !== input.trim() || input.length < 1 || input.length > 500 || /[\u0000-\u001F\u007F]/u.test(input)) {
    return UNSUPPORTED;
  }
  const normalized = input.toLocaleLowerCase("tr-TR").replace(/\s+/gu, " ");
  const matches = MATCHERS.flatMap((matcher) => matcher(normalized, input) ?? []);
  return matches.length === 1 ? matches[0]! : UNSUPPORTED;
}
```

Queries must remain trimmed, 1–120 characters, and contain no control characters.
Export only frozen reply/source records from `response.ts`.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run Step 2. Expected: all local intent tests PASS.

- [ ] **Step 5: Commit the intent slice**

```bash
git add apps/customer-panel/lib/toshi-local apps/customer-panel/lib/toshi-local.test.ts
git commit -m "feat(customer-panel): add toshi local intent engine"
```

---

### Task 3: Connect deterministic commands to real same-origin APIs

**Files:**
- Create: `apps/customer-panel/lib/toshi-local/client.ts`
- Modify: `apps/customer-panel/lib/toshi-local.test.ts`

**Interfaces:**
- Consumes: `ToshiLocalIntent` from Task 2.
- Produces:

```ts
export interface ToshiLocalClient {
  execute(intent: ToshiLocalIntent, signal?: AbortSignal): Promise<ToshiLocalReply>;
}

export function createToshiLocalClient(fetcher?: typeof fetch): ToshiLocalClient;
```

- [ ] **Step 1: Write failing client routing tests**

Use an injected fetcher and assert exact calls:

```ts
assert.deepEqual(paths, [
  "/api/catalog/summary",
  "/api/orders/summary",
  "/api/customers/summary",
  "/api/orders/abandoned-carts/summary",
]);
```

Assert searches use only encoded query parameters:

```ts
"/api/catalog/products?search=KG-M-KREM&limit=10&status=all"
"/api/customers?search=Ada&limit=10"
"/api/orders?search=CBX-1042&limit=10&sort=updated_desc"
```

Every request must set `credentials: "same-origin"`, `cache: "no-store"`, accept only
`application/json`, and never send request bodies or private authority headers.

- [ ] **Step 2: Run client tests and verify RED**

Run Step 2 from Task 2. Expected: FAIL because `createToshiLocalClient` is missing.

- [ ] **Step 3: Implement the minimal reader**

Use a single bounded helper:

```ts
async function read(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetcher(path, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    throw new ToshiLocalError("unavailable");
  }
  return response.json();
}
```

Parse every payload with existing `@celebix/saas-contracts` parsers or exact local
envelope checks. Cap search results at ten. `unsupported` never calls fetch.

- [ ] **Step 4: Verify GREEN and security scan**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/toshi-local.test.ts
rg -n "storeId|tenantId|principalId|membershipId|planId|authorization|x-celebix|/api/admin" apps/customer-panel/lib/toshi-local
```

Expected: tests PASS; `rg` has no matches outside explicit negative-test strings.

- [ ] **Step 5: Commit the client slice**

```bash
git add apps/customer-panel/lib/toshi-local
git commit -m "feat(customer-panel): connect toshi to store reads"
```

---

### Task 4: Implement the accessible shared conversation surface

**Files:**
- Create: `apps/customer-panel/components/toshi/ToshiAssistant.tsx`
- Create: `apps/customer-panel/components/toshi/ToshiDrawer.tsx`
- Create: `apps/customer-panel/components/toshi/ToshiWorkspace.tsx`
- Create: `apps/customer-panel/components/toshi/toshi.module.css`
- Modify: `apps/customer-panel/components/panel/PanelTopbarUtilities.tsx:1-72`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts`

**Interfaces:**
- Consumes: `createToshiLocalClient()`.
- Produces:

```ts
export function ToshiAssistant(props: Readonly<{ mode: "drawer" | "page" }>): JSX.Element;
export function ToshiDrawer(props: Readonly<{
  open: boolean;
  launcherRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
}>): JSX.Element | null;
export function ToshiWorkspace(): JSX.Element;
```

- [ ] **Step 1: Write failing interaction/source tests**

Tests must prove:

- drawer is `role="dialog"`, `aria-modal="true"`, labelled, and has id
  `toshi-assistant-drawer`;
- Escape, backdrop, and close button call `onClose`;
- closing returns focus to `launcherRef`;
- submit owns one request, aborts on unmount, and rejects blank input;
- welcome state lists only supported local commands;
- no fake assistant answer is seeded;
- Toshi replies use `aria-live="polite"`;
- `/toshi` link is present in the drawer;
- mutation language returns the unsupported/confirmation-not-yet-available response
  without a network request.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node --experimental-transform-types --test --test-name-pattern="Toshi" apps/customer-panel/lib/panel-shell.test.ts apps/customer-panel/lib/toshi-local.test.ts
```

Expected: FAIL because Toshi components do not exist.

- [ ] **Step 3: Implement minimal conversation state and drawer**

`ToshiAssistant` owns:

```ts
type ConversationEntry = Readonly<{
  id: string;
  role: "merchant" | "toshi";
  text: string;
  sources?: readonly ToshiLocalSource[];
}>;
```

On submit: append the merchant text, parse intent, execute exactly once, append the
projected response, and clear pending state. Use `crypto.randomUUID()` only for local
React keys, never as durable authority. Disable submit while pending.

`ToshiDrawer` must lock background scroll only while open, focus its title after open,
and restore launcher focus on every close path.

- [ ] **Step 4: Implement responsive CSS**

Desktop drawer: fixed right, width `min(27rem, calc(100vw - 1rem))`, full available
height below the topbar. Mobile `@media (max-width: 1024px)`: inset `0`, width `100%`,
height `100dvh`. All buttons/inputs are at least 48px. Add:

```css
@media (prefers-reduced-motion: reduce) {
  .drawer { transition-duration: 0.01ms; }
}
```

- [ ] **Step 5: Verify GREEN**

Run Step 2. Expected: all Toshi-focused tests PASS.

- [ ] **Step 6: Commit the UI slice**

```bash
git add apps/customer-panel/components/toshi \
  apps/customer-panel/components/panel/PanelTopbarUtilities.tsx \
  apps/customer-panel/components/panel/panel-shell.module.css \
  apps/customer-panel/lib/panel-shell.test.ts
git commit -m "feat(customer-panel): add toshi assistant workspace"
```

---

### Task 5: Mount the server-authorized `/toshi` page and exact route title

**Files:**
- Create: `apps/customer-panel/app/toshi/page.tsx`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts:1-340`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts`
- Modify: `apps/customer-panel/lib/routes.test.ts`

**Interfaces:**
- Consumes: `requireServerPanelAccess()` and `ToshiWorkspace`.
- Produces: exact `/toshi` route presentation titled `Toshi`.

- [ ] **Step 1: Write failing route and near-match tests**

Add:

```ts
assert.equal(resolvePanelRoutePresentation("/toshi").title, "Toshi");
assert.equal(resolvePanelRoutePresentation("/toshi-evil").title, "Yönetim paneli");
```

Assert the page awaits `requireServerPanelAccess()` before rendering
`<ToshiWorkspace />` and passes no `tenantContext` prop.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/navigation.test.ts apps/customer-panel/lib/routes.test.ts
```

Expected: FAIL because `/toshi` is absent.

- [ ] **Step 3: Implement exact route**

Create:

```tsx
import { ToshiWorkspace } from "@/components/toshi/ToshiWorkspace";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ToshiPage() {
  await requireServerPanelAccess();
  return <ToshiWorkspace />;
}
```

Add `/toshi` to `PanelNavigationHref` and `TITLES`, but do not add a sidebar item in
this foundation; the topbar launcher and drawer link are the entry points.

- [ ] **Step 4: Verify GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Commit the route slice**

```bash
git add apps/customer-panel/app/toshi \
  apps/customer-panel/lib/panel-ui/navigation.ts \
  apps/customer-panel/lib/panel-ui/navigation.test.ts \
  apps/customer-panel/lib/routes.test.ts
git commit -m "feat(customer-panel): mount toshi assistant page"
```

---

### Task 6: Browser fixture, responsive acceptance, and complete regression

**Files:**
- Create: `tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/toshi/page.tsx`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/[...slug]/route.ts`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs`
- Modify: `apps/customer-panel/lib/panel-shell.test.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: browser evidence for real local Toshi commands and responsive behavior.

- [ ] **Step 1: Add failing fixture/static checks**

Assert the fixture serves only the same exact catalog/order/customer summary and search
DTO shapes already used by production clients. Add secret/authority scans over every
new Toshi source file.

- [ ] **Step 2: Run static checks and verify RED**

```bash
node --test tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
```

Expected: FAIL because the fixture `/toshi` route is absent.

- [ ] **Step 3: Implement fixture route and deterministic API payloads**

The fixture may contain only clearly labelled browser-test records. Production Toshi
components must still receive them through the same existing API contracts.

- [ ] **Step 4: Verify desktop and mobile in Browser/IAB**

At `1440×900`, `1025×768`, `390×844`, and `320×720` verify:

- real profile image renders;
- open/close/Escape/backdrop/focus return;
- “mağaza özeti”, “bekleyen siparişler”, “düşük stok”, customer/product/order search;
- unknown and mutation commands stay fail-closed;
- 48px minimum targets;
- zero horizontal overflow;
- reduced-motion duration approximately `0.01ms`;
- `/toshi` full page works;
- no console error or failed request.

Save the final untracked screenshot to `/tmp/celebix-toshi-local-assistant.png` and
inspect it together with `/Users/Celebix/Desktop/toshi-profile.webp` using
`view_image` before handoff.

- [ ] **Step 5: Run complete verification**

```bash
git diff --check
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
node --test tests/saas-phase3/hemenaku-admin-presentation/static-security.test.mjs
git diff --name-only -- apps/admin
git diff -- . ':!package-lock.json' | rg -n "sk-|api.?key|authorization:|cookie:|storeId|tenantId|principalId|membershipId" || true
```

Expected:

- all customer-panel tests PASS except existing intentional skips;
- typecheck/build PASS;
- static security PASS;
- `apps/admin` diff output empty;
- secret/private-authority scan empty.

- [ ] **Step 6: Commit browser acceptance**

```bash
git add tests/saas-phase3/hemenaku-admin-presentation \
  apps/customer-panel/lib/panel-shell.test.ts
git commit -m "test(customer-panel): verify toshi local assistant"
```

---

## Follow-on Plans Required by the Approved Spec

This foundation intentionally stops before mutation or provider setup. The approved
design remains decomposed into independently testable follow-on plans:

1. `toshi-durable-action-confirmation` — PostgreSQL action intents, preview,
   confirmation, replay/expiry, audit, and first product/order/customer writes.
2. `toshi-encrypted-provider-vault` — encrypted API key, provider/model allowlist,
   verify/rotate/revoke, settings subpages, PostgreSQL 16 tests.
3. `toshi-provider-tool-orchestration` — server-only provider adapter, bounded tool
   calls, minimum-data projection, content/SEO/campaign generation.
4. `toshi-full-panel-integration` — contextual commands across all real subpages,
   history/audit surfaces, full PostgreSQL/browser/regression acceptance.

No follow-on navigation is exposed until its API and durable authority are complete.

