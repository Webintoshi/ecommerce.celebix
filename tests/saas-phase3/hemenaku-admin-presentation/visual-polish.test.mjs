import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

test("merchant analytics and dashboard charts reserve readable plot geometry", async () => {
  const analytics = await read("apps/customer-panel/components/analytics/AnalyticsDashboard.tsx");
  const dashboard = await read("apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx");
  const dashboardCss = await read("apps/customer-panel/components/dashboard/panel-dashboard.module.css");

  assert.match(analytics, /<LineChart data=\{dashboard[.]series\} accessibilityLayer margin=\{\{ left: 4, right: 16, top: 8, bottom: 0 \}\}>/);
  assert.match(analytics, /<YAxis[\s\S]*?width=\{88\}[\s\S]*?tickMargin=\{8\}/);
  assert.match(dashboard, /<svg className=\{styles[.]seriesChart\} data-dashboard-chart="sales"/);
  assert.match(dashboard, /role="img" aria-label="Dönemlik satış gelirleri"/);
  assert.match(dashboard, /<polyline points=\{points\}/);
  assert.match(dashboardCss, /[.]seriesChart\s*\{[\s\S]*?width:\s*100%;/);
  assert.match(dashboardCss, /@media \(max-width: 640px\)[\s\S]*?[.]seriesChart\s*\{\s*min-height:\s*170px;/);
});

test("sidebar and product controls stay dense without sacrificing target size", async () => {
  const shellCss = await read("apps/customer-panel/components/panel/panel-shell.module.css");
  const catalogCss = await read("apps/customer-panel/app/globals.css");

  assert.match(shellCss, /[.]navigationChildren\s*\{[\s\S]*?max-height:\s*min\(42vh,\s*28rem\);/);
  assert.match(shellCss, /[.]navigationChildren\s*\{[\s\S]*?overflow-y:\s*auto;/);
  assert.match(shellCss, /[.]navigationChildren\s*\{[\s\S]*?overscroll-behavior:\s*contain;/);
  assert.match(catalogCss, /[.]product-stat-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(catalogCss, /[.]product-stat-grid > button\s*\{[^}]*min-height:\s*56px;/);
  assert.match(catalogCss, /[.]product-operations-page [.]product-stat-grid > button\s*\{[^}]*min-height:\s*52px;/);
  assert.match(catalogCss, /@media \(max-width:\s*640px\)[\s\S]*?[.]product-stat-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(catalogCss, /[.]product-bulk-actions > select, [.]product-bulk-actions > button\s*\{\s*min-height:\s*48px;/);
});

test("local Toshi artwork bypasses the runtime image optimizer", async () => {
  const paths = [
    "apps/customer-panel/components/panel/PanelTopbarUtilities.tsx",
    "apps/customer-panel/components/toshi/ToshiDrawer.tsx",
  ];
  for (const relativePath of paths) {
    const source = await read(relativePath);
    assert.match(source, /src="\/toshi\/toshi-profile[.]webp"[\s\S]*?unoptimized/);
  }
});

test("catalog extra preview uses the shared polished merchant surface", async () => {
  const preview = await read("apps/customer-panel/components/catalog-admin/CatalogExtraPreview.tsx");
  const css = await read("apps/customer-panel/components/catalog-admin/catalog-admin-console.module.css");

  for (const className of ["previewHero", "previewEyebrow", "previewPrice", "previewOptions", "previewOptionGrid"]) {
    assert.match(preview, new RegExp(`styles[.]${className}`));
    assert.match(css, new RegExp(`[.]${className}\\s*\\{`));
  }
  assert.doesNotMatch(`${preview}\n${css}`, /unsafe-inline|https?:\/\/|<iframe|dangerouslySetInnerHTML/i);
});

test("client browser fixture mounts only the client panel boundary", async () => {
  const fixture = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/full-parity-fixture.tsx");

  assert.match(fixture, /import \{ PanelLayoutClient \} from "@\/components\/panel\/PanelLayoutClient"/);
  assert.doesNotMatch(fixture, /import \{ PanelShell \}/);
  assert.match(fixture, /analyticsAvailable:\s*false/);
  assert.match(fixture, /<PanelLayoutClient model=\{MODEL\}>/);
});

test("browser fixture serves the immutable Toshi artwork from the target app", async () => {
  const route = await read("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/toshi/toshi-profile.webp/route.ts");

  assert.match(route, /apps\/customer-panel\/public\/toshi\/toshi-profile[.]webp/);
  assert.match(route, /content-type": "image\/webp"/);
  assert.doesNotMatch(route, /https?:\/\/|fetch\(|process[.]env/);
});
