import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";
import ts from "typescript";

const CUSTOMER_PANEL = new URL("../", import.meta.url);
const REPOSITORY = new URL("../../../", import.meta.url);

const panelSource = (path: string) => readFile(new URL(path, CUSTOMER_PANEL), "utf8");
const repositorySource = (path: string) => readFile(new URL(path, REPOSITORY), "utf8");

function declarations(css: string, selector: string) {
  const result: Record<string, string> = {};
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

async function orderAdjacentRoute(fallbackGET: (request: Request, context: unknown) => Promise<Response>) {
  const source = (await repositorySource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/orders/[[...path]]/route.ts"))
    .replace('import { GET as fallbackGET } from "../../[...slug]/route";', "const { fallbackGET } = routeDependencies;")
    .replace('import { ORDER_ADJACENT_CART_ID, ORDER_ADJACENT_DRAFT_ID } from "../../../mira-order-adjacent/order-adjacent-data";', "const { ORDER_ADJACENT_CART_ID, ORDER_ADJACENT_DRAFT_ID } = routeDependencies;");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  Function("require", "module", "exports", "routeDependencies", output)(
    () => { throw new Error("unexpected_require"); },
    module,
    module.exports,
    {
      fallbackGET,
      ORDER_ADJACENT_CART_ID: "92000000-0000-4000-8000-000000000001",
      ORDER_ADJACENT_DRAFT_ID: "91000000-0000-4000-8000-000000000001",
    },
  );
  return module.exports as {
    GET(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response>;
  };
}

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

  const draftAction = declarations(styles[0], ".primaryAction");
  assert.equal(draftAction.background, "#2B2B2B");
  assert.equal(draftAction.color, "#FFFDFC");
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
  assert.equal(declarations(cartCss, ".metric-recovered > strong").color, "var(--mira-text)");
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
  assert.equal(declarations(quickCss, ".summaryWorkspace").overflow, "visible");
  assert.equal(declarations(quickCss, ".summaryActions").position, "sticky");
  assert.match(cartCss, /@media \(max-width: 1024px\)[\s\S]*\.desktopTable\s*\{\s*display:\s*none/);
  for (const css of [draftCss, quickCss, cartCss]) assert.match(css, /@media \(max-width: (?:640|700)px\)/);
});

test("draft mobile action and focus meet the 44px Mira interaction contract", async () => {
  const css = await panelSource("components/orders/order-drafts.module.css");
  const action = declarations(css, ".listSurface .draftCard > .recordLink");
  const focus = declarations(css, ".listSurface .recordLink:focus-visible");

  assert.equal(action["min-height"], "44px");
  assert.equal(focus.outline, "2px solid #2B2B2B");
  assert.equal(focus["outline-offset"], "2px");
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

test("order-adjacent transport delegates requests from every unrelated fixture", async () => {
  const calls: string[] = [];
  const route = await orderAdjacentRoute(async (request) => {
    calls.push(request.url);
    return Response.json({ source: "established-orders-fixture" });
  });
  const context = { params: Promise.resolve({ path: ["abandoned-carts", "summary"] }) };

  const unrelated = await route.GET(new Request("http://fixture.test/api/orders/abandoned-carts/summary", {
    headers: { referer: "http://fixture.test/mira-promotions/list?state=error" },
  }), context);
  assert.equal(unrelated.status, 200);
  assert.deepEqual(await unrelated.json(), { source: "established-orders-fixture" });
  assert.equal(calls.length, 1);

  const taskFive = await route.GET(new Request("http://fixture.test/api/orders/abandoned-carts/summary", {
    headers: { referer: "http://fixture.test/mira-order-adjacent/abandoned-carts" },
  }), context);
  assert.equal(taskFive.status, 200);
  assert.deepEqual(await taskFive.json(), {
    abandoned: 1,
    recovered: 2,
    lostValueCents: 24_000,
    recoveredValueCents: 48_000,
    currency: "TRY",
    asOf: "2026-09-09T12:00:00.000Z",
  });
  assert.equal(calls.length, 1);
});
