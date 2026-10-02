import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import postcss from "postcss";
import ts from "typescript";

import { effectiveCss } from "./mira-final-test-support.ts";
import { createStorePolicyApi } from "./store-policy-ui/client.ts";

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

function rootDeclarations(css: string, selector: string) {
  const result: Record<string, string> = {};
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent?.type !== "root" || !rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

async function settingsPolicyRoute(
  fallbackGET: (request: Request, context: unknown) => Promise<Response>,
  fallbackPATCH: (request: Request, context: unknown) => Promise<Response>,
) {
  const source = (await repositorySource(
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/storefront-policies/[[...path]]/route.ts",
  )).replace(
    'import { GET as fallbackGET, PATCH as fallbackPATCH } from "../../[...slug]/route";',
    "const { fallbackGET, fallbackPATCH } = routeDependencies;",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = { exports: {} as Record<string, unknown> };
  Function("require", "module", "exports", "routeDependencies", output)(
    () => { throw new Error("unexpected_settings_fixture_require"); },
    compiled,
    compiled.exports,
    { fallbackGET, fallbackPATCH },
  );
  return compiled.exports as {
    GET(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response>;
    PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response>;
  };
}

test("settings and remaining-route controls use the Mira palette without decorative provider colors", async () => {
  const [family, merchant, domains, payment, shipping, ai, toshi, design] = await Promise.all([
    panelSource("components/merchant-admin/merchant-family-overview.module.css"),
    panelSource("components/merchant-admin/merchant-module-console.module.css"),
    panelSource("components/settings/domains/store-domain-settings.module.css"),
    panelSource("components/settings/payment/payment-settings.module.css"),
    panelSource("components/shipping/shipping-settings.module.css"),
    panelSource("components/toshi-settings/artificial-intelligence-settings.module.css"),
    panelSource("components/toshi/toshi.module.css"),
    panelSource("components/settings/design-settings.module.css"),
  ]);

  assert.equal(declarations(family, ".settingsRow").background, "#FFFDFC");
  for (const [css, selector] of [
    [merchant, ".primary"],
    [domains, ".add button"],
    [payment, ".primaryButton"],
    [shipping, ".tokenControl button"],
    [ai, ".keyControl button"],
    [toshi, ".composer button"],
    [design, ".publishButton"],
  ] as const) {
    const action = declarations(css, selector);
    assert.equal(action.background, "#2B2B2B", selector);
    assert.equal(action.color, "#FFFDFC", selector);
    assert.ok(Number.parseFloat(action["min-height"] ?? "0") >= 44, selector);
  }
  assert.equal(declarations(domains, ".page").background, "#F8F7F5");
  assert.equal(declarations(payment, ".page").background, "#F8F7F5");
  assert.equal(declarations(ai, ".logo").background, "#F8F7F5");
  assert.doesNotMatch(ai, /#4776e6|#8e54e9|#ef5da8/i);
  assert.equal(declarations(merchant, ".form input:focus-visible").outline, "2px solid #2B2B2B");
  assert.equal(declarations(payment, ".catalogFilters input")["min-height"], "44px");
});

test("secondary settings controls expose 44px targets, visible focus, and warm editor chrome", async () => {
  const [domains, shipping, payment, ai, provider, design] = await Promise.all([
    panelSource("components/settings/domains/store-domain-settings.module.css"),
    panelSource("components/shipping/shipping-settings.module.css"),
    panelSource("components/settings/payment/payment-settings.module.css"),
    panelSource("components/toshi-settings/artificial-intelligence-settings.module.css"),
    panelSource("components/merchant-admin/provider-connection-panel.module.css"),
    panelSource("components/settings/design-settings.module.css"),
  ]);

  for (const [css, selector, properties] of [
    [domains, ".dnsRow button", ["width", "height"]],
    [shipping, ".actions .refresh", ["width"]],
    [payment, ".methodActions > .secondaryButton", ["min-width", "min-height"]],
    [payment, ".methodActionMenu > summary", ["width", "height"]],
    [payment, ".methodActionMenu button", ["min-width", "min-height"]],
    [payment, ".addFlowTabs button", ["min-width", "min-height"]],
    [ai, ".connectionControls select", ["height"]],
    [ai, ".secondaryAction", ["min-width", "min-height"]],
    [ai, ".removeAction", ["width", "height"]],
  ] as const) {
    const control = declarations(css, selector);
    for (const property of properties) {
      assert.ok(Number.parseFloat(control[property] ?? "0") >= 44, `${selector} ${property}`);
    }
  }
  assert.ok(Number.parseFloat(declarations(shipping, ".actions button")["min-height"] ?? "0") >= 44);
  assert.equal(declarations(payment, ".methodActionMenu button:focus-visible").outline, "2px solid #2B2B2B");
  assert.equal(declarations(ai, ".secondaryAction:focus-visible").outline, "2px solid #2B2B2B");

  assert.deepEqual(declarations(provider, ".message"), {
    padding: "12px 14px",
    "border-radius": "8px",
    border: "1px solid #E7E2DD",
    background: "#F8F7F5",
    color: "#2B2B2B",
  });
  assert.equal(rootDeclarations(design, ".homepageSectionInspector").border, "1px solid #E7E2DD");
  assert.equal(rootDeclarations(design, ".homepageSectionInspector").background, "#FFFDFC");
  assert.equal(declarations(design, ".homepageInspectorFields input:not([type=\"radio\"]):not([type=\"checkbox\"])").background, "#FFFDFC");
  assert.equal(rootDeclarations(design, ".settingsModal").border, "1px solid #E7E2DD");
  assert.equal(rootDeclarations(design, ".settingsModal").background, "#FFFDFC");
});

test("settings forms collapse at tablet width and analytics settings own isolated styles", async () => {
  const [merchant, payment, analytics, analyticsWorkspace] = await Promise.all([
    panelSource("components/merchant-admin/merchant-module-console.module.css"),
    panelSource("components/settings/payment/payment-settings.module.css"),
    panelSource("components/analytics/AnalyticsSettingsConsole.tsx"),
    panelSource("components/analytics/CommerceAnalyticsWorkspace.tsx"),
  ]);

  assert.match(merchant, /@media \(max-width: 1024px\)[\s\S]*\.form\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(payment, /@media \(max-width: 1024px\)[\s\S]*\.paymentSummary\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
  assert.match(analytics, /analytics-settings-console[.]module[.]css/);
  assert.doesNotMatch(analytics, /commerce-analytics-workspace[.]module[.]css/);
  assert.match(analyticsWorkspace, /commerce-analytics-workspace[.]module[.]css/);
});

test("policy presentation keeps the approved canvas, readable save control, and single mobile column", () => {
  const path = "components/content/policy-console.module.css";
  const html = '<div class="page"><div class="workspace"><section class="editorColumns split"><button class="button primary">Kaydet</button></section></div></div>';
  const page = effectiveCss(path, html, ".page");
  const action = effectiveCss(path, html, ".primary");
  assert.ok(["#f8f7f5", "rgb(248, 247, 245)"].includes(page.backgroundColor.toLowerCase()));
  assert.ok(["#2b2b2b", "rgb(43, 43, 43)"].includes(action.backgroundColor.toLowerCase()));
  assert.ok(["#fff", "#ffffff", "#fffdfc", "rgb(255, 255, 255)", "rgb(255, 253, 252)"].includes(action.color.toLowerCase()));
  assert.ok(Number.parseFloat(action.minHeight) >= 44);
  assert.equal(effectiveCss(path, html, ".split", 1024).gridTemplateColumns, "minmax(0, 1fr)");
  assert.equal(effectiveCss(path, html, ".workspace", 390).gridTemplateColumns, "minmax(0, 1fr)");
});

test("Toshi uses the shared compact page header and keeps the assistant workspace unobstructed", async () => {
  const [component, css] = await Promise.all([
    panelSource("components/toshi/ToshiWorkspace.tsx"),
    panelSource("components/toshi/toshi.module.css"),
  ]);

  assert.match(component, /<PanelPageHeader[\s\S]*title="Toshi"/);
  assert.doesNotMatch(component, /<Image|workspaceHeader|<PanelPageHeader[^>]*description=/);
  assert.match(component, /<ToshiAssistant mode="page" headerActions=/);
  const workspace = rootDeclarations(css, ".workspace");
  assert.equal(workspace.height, "calc(100dvh - 8rem)");
  assert.equal(workspace["min-height"], "26rem");
  assert.equal(rootDeclarations(css, ".assistant")["min-height"], "0");
  for (const selector of [".chatColumn", ".chatBody"]) {
    const column = rootDeclarations(css, selector);
    assert.equal(column.display, "flex", selector);
    assert.equal(column["flex-direction"], "column", selector);
    assert.equal(column["min-height"], "0", selector);
  }
  const conversation = rootDeclarations(css, ".conversation");
  assert.equal(conversation["min-height"], "0");
  assert.equal(conversation.flex, "1");
  assert.equal(conversation["overflow-y"], "auto");
  for (const selector of [".assistantHeader", ".connectionRow", ".errorState", ".composer"]) {
    assert.equal(rootDeclarations(css, selector)["flex-shrink"], "0", selector);
  }
  const html = '<div class="assistant" data-mode="page" data-history-open="true" style="--cp-action-primary:#2B2B2B;--cp-action-primary-text:#FFFDFC"><header class="assistantHeader"></header><div class="chatBody"><div class="conversation"></div><form class="composer"><button>Gönder</button></form></div></div>';
  const action = effectiveCss("components/toshi/toshi.module.css", html, ".composer button");
  assert.ok(["#2b2b2b", "rgb(43, 43, 43)"].includes(action.backgroundColor.toLowerCase()));
  assert.ok(Number.parseFloat(action.minHeight) >= 44);
  assert.equal((effectiveCss("components/toshi/toshi.module.css", html, ".chatBody", 1440).visibility || "visible"), "visible");
  assert.equal(effectiveCss("components/toshi/toshi.module.css", html, ".chatBody", 1024).visibility, "hidden");
  assert.equal(effectiveCss("components/toshi/toshi.module.css", html, ".chatBody", 390).visibility, "hidden");
  assert.equal((effectiveCss("components/toshi/toshi.module.css", html, ".assistantHeader", 390).visibility || "visible"), "visible");
});

test("domain failure is not rendered as an empty domain collection or a duplicate page hero", async () => {
  const component = await panelSource("components/settings/domains/StoreDomainSettings.tsx");

  assert.match(component, /<PanelTopbarBridge title="Alan Adları" subtitle=/);
  assert.match(component, /loaded \? <>/);
  assert.doesNotMatch(component, /className=\{styles[.]intro\}/);
});

test("isolated settings fixtures use actual consumers and keep the Next page export-safe", async () => {
  const [page, fixture] = await Promise.all([
    repositorySource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-settings/[view]/page.tsx"),
    repositorySource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-settings/SettingsFixtureScreen.tsx"),
  ]);

  assert.doesNotMatch(page, /export\s+(?:const|function|class)\s+/);
  for (const component of [
    "MerchantFamilyOverview",
    "MerchantModuleConsole",
    "MerchantRecordEditor",
    "PolicyConsole",
    "StoreDomainSettings",
    "PaymentSettingsConsole",
    "ShippingSettingsConsole",
    "ArtificialIntelligenceSettings",
    "ToshiWorkspace",
    "AnalyticsSettingsConsole",
  ]) assert.match(fixture, new RegExp(component));
  assert.match(fixture, /kind="lucky_wheel"/);
  assert.match(fixture, /design-unavailable/);
});

test("settings policy transport is pathname-gated, delegates fallbacks, and rejects persistence", async () => {
  const calls: string[] = [];
  const route = await settingsPolicyRoute(
    async (request) => {
      calls.push(`GET ${request.url}`);
      return Response.json({ source: "established-fixture" });
    },
    async (request) => {
      calls.push(`PATCH ${request.url}`);
      return Response.json({ source: "established-mutation" });
    },
  );
  const listContext = { params: Promise.resolve({ path: undefined }) };
  const policyContext = { params: Promise.resolve({ path: ["privacy_security"] }) };

  const unrelated = await route.GET(new Request("http://fixture.test/api/storefront-policies", {
    headers: { referer: "http://fixture.test/mira-order-adjacent/drafts" },
  }), listContext);
  assert.deepEqual(await unrelated.json(), { source: "established-fixture" });
  assert.equal(calls.length, 1);

  const scoped = await route.GET(new Request("http://fixture.test/api/storefront-policies", {
    headers: { referer: "http://fixture.test/mira-settings/policies" },
  }), listContext);
  const payload = await scoped.json() as { items: readonly unknown[] };
  assert.equal(payload.items.length, 7);
  assert.equal(calls.length, 1);

  const api = createStorePolicyApi(async (input, init) => {
    const path = new URL(String(input), "http://fixture.test").pathname.split("/").filter(Boolean).slice(2);
    return route.GET(new Request(new URL(String(input), "http://fixture.test"), {
      ...init,
      headers: { ...init?.headers, referer: "http://fixture.test/mira-settings/policy-edit" },
    }), { params: Promise.resolve({ path }) });
  });
  assert.equal((await api.list()).length, 7);

  const rejected = await route.PATCH(new Request("http://fixture.test/api/storefront-policies/privacy_security", {
    method: "PATCH",
    headers: { referer: "http://fixture.test/mira-settings/policy-edit" },
  }), policyContext);
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { code: "version_conflict" });
  assert.equal(calls.length, 1);
});

test("local policy transport keeps the exact client shape and advances only synthetic state", async () => {
  let delegated = 0;
  const route = await settingsPolicyRoute(
    async () => { delegated++; return Response.json({}); },
    async () => { delegated++; return Response.json({}); },
  );
  const api = createStorePolicyApi(async (input, init) => {
    const url = new URL(String(input), "http://fixture.test");
    const path = url.pathname.split("/").filter(Boolean).slice(2);
    const request = new Request(url, {
      ...init,
      headers: { ...init?.headers, referer: "http://fixture.test/content/policies?session=isolated-normal" },
    });
    const context = { params: Promise.resolve({ path }) };
    return init?.method === "PATCH" ? route.PATCH(request, context) : route.GET(request, context);
  });
  const initial = await api.list();
  assert.equal(initial.length, 7);
  const saved = await api.save("privacy_security", { expectedVersion: 3, body: "Yerel yeni metin", status: "published" });
  assert.equal(saved.version, 4);
  assert.equal(saved.body, "Yerel yeni metin");
  assert.equal((await api.get("privacy_security")).body, "Yerel yeni metin");
  assert.equal((await api.list())[0].version, 4);
  assert.equal(delegated, 0);
});

test("local conflict and unknown-commit fixtures fail the first recovery read and retain canonical state", async () => {
  for (const scenario of ["conflict-refresh-error", "commit-unknown"]) {
    const route = await settingsPolicyRoute(
      async () => { throw new Error("Local policies cannot delegate to a live boundary"); },
      async () => { throw new Error("Local policies cannot delegate to a live boundary"); },
    );
    const api = createStorePolicyApi(async (input, init) => {
      const url = new URL(String(input), "http://fixture.test");
      const path = url.pathname.split("/").filter(Boolean).slice(2);
      const request = new Request(url, {
        ...init,
        headers: { ...init?.headers, referer: `http://fixture.test/policies?scenario=${scenario}&session=isolated` },
      });
      const context = { params: Promise.resolve({ path }) };
      return init?.method === "PATCH" ? route.PATCH(request, context) : route.GET(request, context);
    });
    await api.list();
    await assert.rejects(api.save("privacy_security", { expectedVersion: 3, body: "Yerel kaydedilecek metin", status: "published" }), { code: scenario === "commit-unknown" ? "commit_unknown" : "version_conflict" });
    await assert.rejects(api.get("privacy_security"), { code: "unavailable" });
    const recovered = await api.get("privacy_security");
    assert.equal(recovered.version, 4);
    assert.equal(recovered.body, scenario === "commit-unknown" ? "Yerel kaydedilecek metin" : "Başka oturumun yerel test metni.");
  }
});
