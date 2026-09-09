import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CUSTOMER_PANEL = new URL("../", import.meta.url);
const REPOSITORY = new URL("../../../", import.meta.url);

const panelSource = (path: string) => readFile(new URL(path, CUSTOMER_PANEL), "utf8");
const repositorySource = (path: string) => readFile(new URL(path, REPOSITORY), "utf8");

test("order-adjacent workspaces use the approved Mira palette and graphite primary actions", async () => {
  const styles = await Promise.all([
    panelSource("components/orders/order-drafts.module.css"),
    panelSource("components/orders/quick-order-links.module.css"),
    panelSource("components/orders/abandoned-cart-console.module.css"),
  ]);

  for (const css of styles) {
    assert.match(css, /--mira-accent:\s*#FE6100/);
    assert.match(css, /--mira-text:\s*#2B2B2B/);
    assert.match(css, /--mira-surface:\s*#FFFDFC/);
    assert.match(css, /--mira-border:\s*#E7E2DD/);
    assert.match(css, /background:\s*var\(--mira-text\)/);
  }
});

test("ordinary order-adjacent states stay neutral while outcome states remain semantic", async () => {
  const [drafts, editor, quickLinks, carts, cartCss] = await Promise.all([
    panelSource("components/orders/OrderDraftListConsole.tsx"),
    panelSource("components/orders/OrderDraftEditor.tsx"),
    panelSource("components/orders/QuickOrderLinksConsole.tsx"),
    panelSource("components/orders/AbandonedCartConsole.tsx"),
    panelSource("components/orders/abandoned-cart-console.module.css"),
  ]);

  assert.match(drafts, /status === "converted" \? "success" : "neutral"/);
  assert.doesNotMatch(editor, /record\.status === "draft" \? "warning"/);
  assert.match(quickLinks, /status === "paid"\) return "success";[\s\S]*status === "cancelled"\) return "danger";[\s\S]*return "neutral";/);
  assert.match(carts, /status === "recovered"[\s\S]*\? "success"[\s\S]*status === "abandoned"[\s\S]*\? "danger"[\s\S]*: "neutral"/);
  assert.doesNotMatch(cartCss, /\.metric-recovered\s*>\s*strong\s*\{[^}]*color:/);
});

test("tablet layouts collapse real work grids and keep save-clear actions reachable", async () => {
  const [draftCss, quickCss, cartCss] = await Promise.all([
    panelSource("components/orders/order-drafts.module.css"),
    panelSource("components/orders/quick-order-links.module.css"),
    panelSource("components/orders/abandoned-cart-console.module.css"),
  ]);

  assert.match(draftCss, /@media \(max-width: 1024px\)[\s\S]*\.editorWorkspace\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(quickCss, /@media \(max-width: 1024px\)[\s\S]*\.builderGrid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(quickCss, /\.summaryActions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;/s);
  assert.match(cartCss, /@media \(max-width: 1024px\)[\s\S]*\.desktopTable\s*\{\s*display:\s*none/);
  for (const css of [draftCss, quickCss, cartCss]) assert.match(css, /@media \(max-width: (?:640|700)px\)/);
});

test("quick-link recovery focus lands on a visible heading above the sticky action dock", async () => {
  const [quickLinks, quickCss] = await Promise.all([
    panelSource("components/orders/QuickOrderLinksConsole.tsx"),
    panelSource("components/orders/quick-order-links.module.css"),
  ]);

  assert.match(quickLinks, /headingRef=\{listHeadingRef\}/);
  assert.doesNotMatch(quickLinks, /ref=\{listHeadingRef\}[^>]*className="sr-only"/);
  assert.match(quickCss, /\.panelHeading h2\[tabindex="-1"\]\s*\{[^}]*scroll-margin-top:/s);
});

test("isolated order-adjacent fixtures reuse real clients and keep Next pages export-safe", async () => {
  const [page, fixture, transport] = await Promise.all([
    repositorySource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-order-adjacent/[view]/page.tsx"),
    repositorySource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-order-adjacent/order-adjacent-fixture.tsx"),
    repositorySource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/orders/[[...path]]/route.ts"),
  ]);

  assert.doesNotMatch(page, /export\s+(?:const|function|class)\s+/);
  for (const component of ["OrderDraftListConsole", "OrderDraftEditor", "QuickOrderLinksConsole", "AbandonedCartConsole", "AbandonedCartDetailConsole"]) {
    assert.match(fixture, new RegExp(component));
  }
  for (const clientBoundary of ["drafts", "quick-links/payment-methods", "abandoned-carts/summary"]) {
    assert.match(transport, new RegExp(clientBoundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(transport, /version_conflict/);
});
