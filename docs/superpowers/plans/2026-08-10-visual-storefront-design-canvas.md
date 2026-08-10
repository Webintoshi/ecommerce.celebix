# Visual Storefront Design Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the permanently split design form with a full-width, directly selectable storefront canvas and an accessible right settings drawer while preserving every existing persistence authority.

**Architecture:** Add a pure surface-to-workspace model, instrument the existing storefront renderer with optional editor-only selection callbacks, compose missing preview-only surfaces in customer-panel, and let `DesignWorkspace` open the existing `DesignStepEditor` inside a dismissible right drawer. The existing design autosave/publish chain, media upload API, and separate category-showcase merchant-admin API remain unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, CSS Modules, `@celebix/storefront-design-ui`, Node test runner.

## Global Constraints

- Do not create an iframe, reverse proxy, second storefront renderer, or browser-owned tenant/store authority.
- Preserve the current 700 ms autosave chain, version-conflict handling, immutable draft updates, and single publish action.
- Keep `CategoryShowcaseEditor` on its existing merchant-admin authority; do not copy category configuration into `StorefrontDesignDocument`.
- Normal storefront output must remain unchanged when editor callbacks are omitted.
- Every visual surface must remain reachable with keyboard controls through the canvas or the compact `Alanlar` menu.
- Minimum interactive target is 48×48 px; selection cannot be expressed by color alone.
- At 1024 px and below, the settings drawer becomes a full-screen/bottom-sheet surface; 1025 px remains desktop.
- Reduced-motion transitions use approximately `0.01ms`.
- No production deploy, production data, credential mutation, migration, or dependency change.

## File Structure

- Create `apps/customer-panel/components/settings/design/design-surface-model.ts`: immutable surface definitions and surface/location conversion.
- Create `apps/customer-panel/components/settings/design/design-surface-model.test.ts`: exact mapping and uniqueness tests.
- Create `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx`: real renderer composition, preview-only neutral sections, and surface selection.
- Create `apps/customer-panel/components/settings/design/DesignSettingsDrawer.tsx`: accessible right drawer and focus restoration.
- Modify `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx`: optional editor-only surface callbacks on existing rendered elements.
- Modify `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts`: prove default markup compatibility and editor selection hooks.
- Modify `apps/customer-panel/components/settings/design/DesignPreview.tsx`: delegate to the visual canvas.
- Modify `apps/customer-panel/components/settings/design/DesignWorkspace.tsx`: replace area rail/inspector columns with canvas and drawer state.
- Modify `apps/customer-panel/components/settings/design/DesignStepEditor.tsx`: expose concise drawer-first brand upload and reuse all existing editors.
- Modify `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts`: assert visual canvas, drawer, single authority, and security invariants.
- Modify `apps/customer-panel/components/settings/design-settings.module.css`: full-width canvas, overlays, drawer, responsive and reduced-motion rules.
- Modify `apps/customer-panel/lib/design-settings.test.ts`: update the static architecture contract.

---

### Task 1: Immutable visual surface model

**Files:**
- Create: `apps/customer-panel/components/settings/design/design-surface-model.ts`
- Create: `apps/customer-panel/components/settings/design/design-surface-model.test.ts`
- Modify: `apps/customer-panel/components/settings/design/workspace-navigation-model.ts:1-76`

**Interfaces:**
- Produces: `DesignCanvasSurface`, `DesignCanvasSurfaceItem`, `DESIGN_CANVAS_SURFACES`, `designCanvasSurface(key)`, `designCanvasSurfaceForLocation(location)`.
- Consumes: `DesignWorkspaceArea`, `DesignWorkspaceLocation`, and `DesignWorkspaceStep`.

- [ ] **Step 1: Write the failing mapping test**

```ts
test("every visual surface resolves to one existing workspace location", () => {
  assert.deepEqual(DESIGN_CANVAS_SURFACES.map(({ key, location }) => [key, location]), [
    ["brand", { area: "site", step: "brand" }],
    ["announcement", { area: "site", step: "navigation" }],
    ["navigation", { area: "site", step: "navigation" }],
    ["style", { area: "site", step: "style" }],
    ["hero", { area: "home", step: "hero" }],
    ["categories", { area: "home", step: "sections" }],
    ["products", { area: "home", step: "sections" }],
    ["promotion", { area: "home", step: "promotion" }],
    ["product", { area: "site", step: "product" }],
    ["cart", { area: "site", step: "cart" }],
    ["footer", { area: "site", step: "footer" }],
    ["assets", { area: "home", step: "assets" }],
  ]);
  assert.equal(new Set(DESIGN_CANVAS_SURFACES.map(({ key }) => key)).size, DESIGN_CANVAS_SURFACES.length);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd apps/customer-panel
node --experimental-transform-types --test components/settings/design/design-surface-model.test.ts
```

Expected: FAIL because `design-surface-model.ts` does not exist.

- [ ] **Step 3: Implement the frozen model**

```ts
export type DesignCanvasSurface = "brand" | "announcement" | "navigation" | "style" | "hero" | "categories" | "products" | "promotion" | "product" | "cart" | "footer" | "assets";

export interface DesignCanvasSurfaceItem {
  readonly key: DesignCanvasSurface;
  readonly label: string;
  readonly hint: string;
  readonly location: DesignWorkspaceLocation;
}

export const DESIGN_CANVAS_SURFACES = Object.freeze([
  Object.freeze({ key: "brand", label: "Logo ve marka", hint: "Logonuzu ve mağaza kimliğinizi düzenleyin.", location: Object.freeze({ area: "site", step: "brand" }) }),
  Object.freeze({ key: "announcement", label: "Duyuru şeridi", hint: "Duyuru mesajını ve hareketini düzenleyin.", location: Object.freeze({ area: "site", step: "navigation" }) }),
  Object.freeze({ key: "navigation", label: "Header ve menü", hint: "Logo ve menü yerleşimini düzenleyin.", location: Object.freeze({ area: "site", step: "navigation" }) }),
  Object.freeze({ key: "style", label: "Renk ve yazı", hint: "Mağaza renklerini ve yazılarını düzenleyin.", location: Object.freeze({ area: "site", step: "style" }) }),
  Object.freeze({ key: "hero", label: "Ana banner", hint: "Banner görsellerini ve bağlantılarını düzenleyin.", location: Object.freeze({ area: "home", step: "hero" }) }),
  Object.freeze({ key: "categories", label: "Kategori vitrini", hint: "Kategori kartlarını ve görsellerini düzenleyin.", location: Object.freeze({ area: "home", step: "sections" }) }),
  Object.freeze({ key: "products", label: "Ürün bölümü", hint: "Ana sayfa ürün sırasını düzenleyin.", location: Object.freeze({ area: "home", step: "sections" }) }),
  Object.freeze({ key: "promotion", label: "Promosyon", hint: "Kampanya alanını ve zamanını düzenleyin.", location: Object.freeze({ area: "home", step: "promotion" }) }),
  Object.freeze({ key: "product", label: "Ürün sayfası", hint: "Galeri ve satın alma alanını düzenleyin.", location: Object.freeze({ area: "site", step: "product" }) }),
  Object.freeze({ key: "cart", label: "Yan sepet", hint: "Sepet görünümünü ve güven mesajlarını düzenleyin.", location: Object.freeze({ area: "site", step: "cart" }) }),
  Object.freeze({ key: "footer", label: "Footer", hint: "Alt menü ve bülten alanını düzenleyin.", location: Object.freeze({ area: "site", step: "footer" }) }),
  Object.freeze({ key: "assets", label: "Görsel arşivi", hint: "Banner ve kategori görsellerini yönetin.", location: Object.freeze({ area: "home", step: "assets" }) }),
] satisfies readonly DesignCanvasSurfaceItem[]);

export function designCanvasSurface(key: DesignCanvasSurface): DesignCanvasSurfaceItem {
  return DESIGN_CANVAS_SURFACES.find((item) => item.key === key)!;
}
```

- [ ] **Step 4: Run mapping and navigation tests and verify GREEN**

Run:

```bash
cd apps/customer-panel
node --experimental-transform-types --test components/settings/design/design-surface-model.test.ts components/settings/design/workspace-navigation-model.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/customer-panel/components/settings/design/design-surface-model.ts apps/customer-panel/components/settings/design/design-surface-model.test.ts apps/customer-panel/components/settings/design/workspace-navigation-model.ts
git commit -m "feat(customer-panel): model visual design surfaces"
```

### Task 2: Editor-only hooks on the real storefront renderer

**Files:**
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx:12-105`
- Modify: `packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts:84-145`

**Interfaces:**
- Consumes: surface keys `announcement | brand | navigation | hero | promotion | cart`.
- Produces: optional `editor?: { selectedSurface?: string; onSelectSurface(surface: StorefrontRendererSurface): void }` prop with no default runtime output change.

- [ ] **Step 1: Add failing renderer compatibility and hook tests**

```ts
test("editor hooks select exact rendered surfaces without changing default storefront", async () => {
  const source = await readFile(new URL("./StorefrontDesignRenderer.tsx", import.meta.url), "utf8");
  assert.match(source, /editor\?: StorefrontDesignEditorBridge/);
  assert.match(source, /onSelectSurface\("brand"\)/);
  assert.match(source, /onSelectSurface\("navigation"\)/);
  assert.match(source, /onSelectSurface\("hero"\)/);
  assert.match(source, /onSelectSurface\("cart"\)/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(StorefrontDesignRenderer, defaultProps)), /data-design-surface|Düzenle/);
});
```

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```bash
npm test --workspace @celebix/storefront-design-ui
```

Expected: FAIL because the editor bridge is absent.

- [ ] **Step 3: Implement optional edit instrumentation**

```tsx
export type StorefrontRendererSurface = "announcement" | "brand" | "navigation" | "hero" | "promotion" | "cart";
export interface StorefrontDesignEditorBridge {
  readonly selectedSurface?: StorefrontRendererSurface;
  readonly onSelectSurface: (surface: StorefrontRendererSurface) => void;
}

function editControl(editor: StorefrontDesignEditorBridge | undefined, surface: StorefrontRendererSurface, label: string) {
  return editor ? <button type="button" className="celebix-store-edit-control" data-design-surface={surface} aria-pressed={editor.selectedSurface === surface} onClick={() => editor.onSelectSurface(surface)}>{label}</button> : null;
}
```

Place controls adjacent to the existing announcement, brand, navigation, hero, promotion, and bag elements. Do not wrap links with buttons and do not add the controls when `editor` is omitted.

- [ ] **Step 4: Add editor-control CSS without changing default selectors**

```css
.celebix-store-edit-shell { position: relative; }
.celebix-store-edit-control { position: absolute; z-index: 10; min-width: 48px; min-height: 48px; border: 2px solid transparent; }
.celebix-store-edit-control[aria-pressed="true"] { border-color: #ff5a00; }
```

The class is emitted only for editor mode, so production storefront markup and behavior stay unchanged.

- [ ] **Step 5: Run renderer test/typecheck and verify GREEN**

Run:

```bash
npm test --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/storefront-design-ui
```

Expected: all existing renderer tests plus the new compatibility test PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx packages/storefront-design-ui/src/StorefrontDesignRenderer.test.ts packages/storefront-design-ui/src/storefront-design.css
git commit -m "feat(storefront): expose editor-only design surfaces"
```

### Task 3: Full storefront canvas and selectable preview sections

**Files:**
- Create: `apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx`
- Modify: `apps/customer-panel/components/settings/design/DesignPreview.tsx:1-13`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts:28-80`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css:80-94`

**Interfaces:**
- Consumes: `DesignCanvasSurface`, draft design, media, destinations, viewport mode, and `onSelectSurface`.
- Produces: one `<VisualStorefrontCanvas>` whose real renderer and neutral composition surfaces share the same selection callback.

- [ ] **Step 1: Write failing source and model assertions**

```ts
assert.match(preview, /<VisualStorefrontCanvas/);
assert.match(canvas, /StorefrontDesignRenderer/);
for (const surface of ["categories", "products", "product", "cart", "footer", "assets"]) {
  assert.match(canvas, new RegExp(`data-design-surface=["']${surface}["']`));
}
assert.doesNotMatch(canvas, /iframe|localStorage|sessionStorage|x-store-id|tenantContext/);
```

- [ ] **Step 2: Run focused workspace tests and verify RED**

Run:

```bash
cd apps/customer-panel
node --experimental-transform-types --test components/settings/design/DesignWorkspace.test.ts
```

Expected: FAIL because `VisualStorefrontCanvas` and direct surface markers do not exist.

- [ ] **Step 3: Implement the visual canvas**

```tsx
export function VisualStorefrontCanvas(props: Readonly<VisualStorefrontCanvasProps>) {
  const preview = createPreviewStorefrontDesign({ draft: props.design, publishedVersion: props.publishedVersion, publishedAt: props.publishedAt, media: props.media, destinations: props.destinations });
  return <div className={styles.previewViewport} data-mode={props.mode}>
    <StorefrontDesignRenderer design={preview} storeName={props.storeName} now={props.now} compact editor={{ selectedSurface: rendererSurface(props.selectedSurface), onSelectSurface: props.onSelectSurface }}>
      <section className={styles.canvasCategoryPreview} data-design-surface="categories"><SurfaceButton surface="categories" onSelect={props.onSelectSurface}>Kategori vitrini</SurfaceButton></section>
      <section className={styles.canvasProductPreview} data-design-surface="products"><SurfaceButton surface="products" onSelect={props.onSelectSurface}>Ürün bölümü</SurfaceButton></section>
      <section className={styles.canvasProductDetailPreview} data-design-surface="product"><SurfaceButton surface="product" onSelect={props.onSelectSurface}>Ürün sayfası</SurfaceButton></section>
      <section className={styles.canvasFooterPreview} data-design-surface="footer"><SurfaceButton surface="footer" onSelect={props.onSelectSurface}>Footer</SurfaceButton></section>
    </StorefrontDesignRenderer>
  </div>;
}
```

Neutral preview surfaces use labels and composition values only; they must not invent customer, order, KPI, price, or inventory data.

- [ ] **Step 4: Implement full-width canvas CSS**

```css
.canvasStage { min-width: 0; overflow: auto; background: #eef1f5; padding: clamp(12px, 2vw, 28px); }
.previewViewport { width: min(100%, 1440px); margin-inline: auto; transition: width .2s ease; }
.canvasSurface { position: relative; min-height: 160px; }
.canvasSurfaceButton { position: absolute; inset: 8px; min-width: 48px; min-height: 48px; border: 2px solid transparent; background: transparent; }
.canvasSurfaceButton[aria-pressed="true"] { border-color: #ff5a00; box-shadow: inset 0 0 0 2px #fff; }
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
cd apps/customer-panel
node --experimental-transform-types --test components/settings/design/design-surface-model.test.ts components/settings/design/DesignWorkspace.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/customer-panel/components/settings/design/VisualStorefrontCanvas.tsx apps/customer-panel/components/settings/design/DesignPreview.tsx apps/customer-panel/components/settings/design/DesignWorkspace.test.ts apps/customer-panel/components/settings/design-settings.module.css
git commit -m "feat(customer-panel): render visual storefront canvas"
```

### Task 4: Accessible right settings drawer and workspace integration

**Files:**
- Create: `apps/customer-panel/components/settings/design/DesignSettingsDrawer.tsx`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.tsx:3-101`
- Modify: `apps/customer-panel/components/settings/design/DesignStepEditor.tsx:61-93`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts:28-105`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css:1-94`

**Interfaces:**
- Consumes: selected surface definition, `DesignStepEditor`, close callback, and `returnFocusRef`.
- Produces: `DesignSettingsDrawer` with `role="dialog"`, `aria-modal` only on mobile, Escape/backdrop/close behavior, and focus restoration.

- [ ] **Step 1: Add failing drawer/workspace assertions**

```ts
assert.match(workspace, /selectedSurface/);
assert.match(workspace, /<DesignSettingsDrawer/);
assert.match(workspace, /<DesignPreview[^>]*onSelectSurface=/s);
assert.doesNotMatch(workspace, /className=\{styles[.]stepRail\}|className=\{styles[.]inspector\}|aria-label="Tasarım alanı"/);
assert.match(drawer, /role="dialog"/);
assert.match(drawer, /event[.]key === "Escape"/);
assert.match(drawer, /focus\(\)/);
assert.match(drawer, /Ayarları kapat/);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd apps/customer-panel
node --experimental-transform-types --test components/settings/design/DesignWorkspace.test.ts
```

Expected: FAIL because the drawer and canvas-driven selection state are absent.

- [ ] **Step 3: Implement the drawer**

```tsx
export function DesignSettingsDrawer({ open, surface, children, onClose, returnFocusRef }: Readonly<DesignSettingsDrawerProps>) {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  useEffect(() => { if (!open) returnFocusRef.current?.focus(); }, [open, returnFocusRef]);
  if (!open) return null;
  return <><button type="button" className={styles.drawerBackdrop} aria-label="Ayarları kapat" onClick={onClose} /><aside className={styles.settingsDrawer} role="dialog" aria-labelledby="design-drawer-title"><header><div><span>Düzenleniyor</span><h2 id="design-drawer-title">{surface.label}</h2><p>{surface.hint}</p></div><button type="button" aria-label="Ayarları kapat" onClick={onClose}><X /></button></header><div className={styles.drawerBody}>{children}</div></aside></>;
}
```

- [ ] **Step 4: Replace permanent rails with canvas-driven workspace state**

```tsx
const [selectedSurface, setSelectedSurface] = useState<DesignCanvasSurface>(() => designCanvasSurfaceForLocation(initialLocation).key);
const [drawerOpen, setDrawerOpen] = useState(false);
const selected = designCanvasSurface(selectedSurface);
const selectSurface = useCallback((surface: DesignCanvasSurface, trigger?: HTMLButtonElement) => {
  returnFocusRef.current = trigger ?? null;
  setSelectedSurface(surface);
  setLocation(designCanvasSurface(surface).location);
  setDrawerOpen(true);
}, []);
```

Render one compact `Alanlar` menu in the top toolbar, the canvas as the page body, and the drawer as an overlay sibling. Keep the existing `queueSave`, `upload`, and `publish` functions byte-for-byte equivalent.

- [ ] **Step 5: Make brand upload the first drawer action**

Keep `DesignInspector section="brand"` before the advanced asset archive and label the visible action `Logo seç veya yükle`. Do not add a second upload endpoint.

- [ ] **Step 6: Implement responsive drawer and focus CSS**

```css
.settingsDrawer { position: fixed; z-index: 50; top: 5.5rem; right: 0; bottom: 0; width: min(420px, calc(100vw - 24px)); overflow-y: auto; background: #fff; box-shadow: -24px 0 60px rgb(16 24 40 / 18%); }
.drawerBackdrop { position: fixed; z-index: 49; inset: 5.5rem 0 0; border: 0; background: rgb(16 24 40 / 32%); }
@media (max-width: 1024px) { .settingsDrawer { top: auto; left: 0; width: 100%; max-height: calc(100dvh - 48px); border-radius: 22px 22px 0 0; } }
@media (prefers-reduced-motion: reduce) { .settingsDrawer, .drawerBackdrop, .previewViewport { transition-duration: .01ms !important; } }
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
cd apps/customer-panel
node --experimental-transform-types --test components/settings/design/design-surface-model.test.ts components/settings/design/workspace-navigation-model.test.ts components/settings/design/DesignWorkspace.test.ts
```

Expected: all focused design workspace tests PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/customer-panel/components/settings/design/DesignSettingsDrawer.tsx apps/customer-panel/components/settings/design/DesignWorkspace.tsx apps/customer-panel/components/settings/design/DesignStepEditor.tsx apps/customer-panel/components/settings/design/DesignWorkspace.test.ts apps/customer-panel/components/settings/design-settings.module.css
git commit -m "feat(customer-panel): edit storefront from right drawer"
```

### Task 5: Security, accessibility, responsive and full regression gate

**Files:**
- Modify: `apps/customer-panel/lib/design-settings.test.ts:1-55`
- Modify: `apps/customer-panel/components/settings/design/DesignWorkspace.test.ts:28-120`
- Modify: `apps/customer-panel/components/settings/design-settings.module.css`

**Interfaces:**
- Consumes: completed visual canvas and drawer.
- Produces: final static/security assertions and verified build artifacts.

- [ ] **Step 1: Add failing final-contract assertions**

```ts
assert.match(workspace, /data-panel-layout="visual-storefront-canvas"/);
assert.match(css, /min-height:\s*48px/);
assert.match(css, /@media \(max-width:\s*1024px\)/);
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /[.]01ms/);
assert.doesNotMatch(allSources, /iframe|localStorage|sessionStorage|x-store-id|tenantContext|dangerouslySetInnerHTML/);
assert.equal((workspace.match(/>Yayınla<\/button>/g) ?? []).length, 1);
```

- [ ] **Step 2: Run contract test and verify RED**

Run:

```bash
cd apps/customer-panel
node --experimental-transform-types --test lib/design-settings.test.ts components/settings/design/DesignWorkspace.test.ts
```

Expected: FAIL because `data-panel-layout="visual-storefront-canvas"` and the final security source aggregation are not yet asserted by the implementation.

- [ ] **Step 3: Implement the final accessibility/responsive contract**

```css
.canvasSurfaceButton, .drawerClose, .surfaceMenu button { min-width: 48px; min-height: 48px; }
.canvasSurfaceButton:focus-visible, .drawerClose:focus-visible, .surfaceMenu button:focus-visible { outline: 3px solid rgb(255 90 0 / 32%); outline-offset: 3px; }
@media (max-width: 1024px) { .settingsDrawer { top: auto; left: 0; width: 100%; max-height: calc(100dvh - 48px); } }
@media (max-width: 390px) { .canvasStage { padding-inline: 8px; } .previewViewport { max-width: 100%; } }
@media (prefers-reduced-motion: reduce) { .settingsDrawer, .drawerBackdrop, .previewViewport { transition-duration: .01ms !important; } }
```

Keep exactly one `Yayınla` button in `DesignWorkspace` and do not modify `queueSave`, `upload`, or `publish` persistence behavior.

- [ ] **Step 4: Run the complete verification matrix**

```bash
npm test --workspace @celebix/storefront-design-ui
npm run typecheck --workspace @celebix/storefront-design-ui
cd apps/customer-panel
node --experimental-transform-types --test components/settings/design/*.test.ts
node --experimental-transform-types --test lib/design-settings.test.ts
cd ../..
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
git diff --name-only 7c6921658f5d12a1b475101d2f6fb13d0863d20a...HEAD
git diff 7c6921658f5d12a1b475101d2f6fb13d0863d20a...HEAD | rg -n -i 'secret|password|token|private[_-]?key|x-store-id|tenantContext' || true
```

Expected: every test/typecheck/build passes; scan contains no credential or browser-authority introduction.

- [ ] **Step 5: Run local visual acceptance**

Start customer-panel locally with its safe existing development configuration and capture these states without changing staging:

- 1440×900: canvas, drawer closed;
- 1440×900: logo selected, right drawer open;
- 1280×800: hero selected;
- 1025×768: desktop drawer;
- 1024×768: mobile drawer;
- 390×844 and 320×720: mobile canvas and drawer;
- category and footer selected states.

Verify horizontal overflow is zero, every edit target is at least 48×48 px, Escape/backdrop/close work, and focus returns to the selected canvas target.

- [ ] **Step 6: Commit final verification adjustments**

```bash
git add apps/customer-panel/lib/design-settings.test.ts apps/customer-panel/components/settings/design/DesignWorkspace.test.ts apps/customer-panel/components/settings/design-settings.module.css
git commit -m "test(customer-panel): verify visual design canvas"
```

- [ ] **Step 7: Push without force**

```bash
git push origin codex/design-tabs-save-fix-live
git rev-parse HEAD
git rev-parse origin/codex/design-tabs-save-fix-live
git status --short
```

Expected: local and remote SHA match; only user-owned untracked artifact directories may remain.

## Deployment Gate

No staging or production deployment is part of this implementation plan. After code, tests, build, and local visual evidence pass, report the exact SHA and request separate staging deployment authorization.
