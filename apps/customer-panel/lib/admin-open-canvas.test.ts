import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("shared panel pages publish the open-canvas contract", async () => {
  const component = await source("components/panel/PanelPageShell.tsx");
  const css = await source("components/panel/panel-shell.module.css");

  assert.match(component, /data-panel-layout="open-canvas"/);
  assert.match(component, /data-panel-surface="open"/);
  assert.match(rule(css, ".panel"), /border:\s*0/);
  assert.match(rule(css, ".panel"), /border-radius:\s*0/);
  assert.match(rule(css, ".panel"), /background:\s*transparent/);
  assert.match(rule(css, ".panel"), /box-shadow:\s*none/);
});

test("orders use a flat workspace and divider-based mobile rows", async () => {
  const css = await source("components/orders/order-console.module.css");

  for (const declaration of [
    /border:\s*0/,
    /border-radius:\s*0/,
    /background:\s*transparent/,
    /box-shadow:\s*none/,
  ]) {
    assert.match(rule(css, ".listSurface"), declaration);
  }
  assert.match(rule(css, ".orderCard"), /border-bottom:\s*1px solid #E8EDF4/i);
  assert.match(rule(css, ".orderCard"), /border-radius:\s*0/);
});

const OPEN_SURFACES = Object.freeze([
  ["components/customers/customer-console.module.css", ".surface"],
  ["components/catalog-admin/catalog-admin-console.module.css", ".surface"],
  ["components/orders/abandoned-cart-console.module.css", ".surface"],
  ["components/orders/order-drafts.module.css", ".listSurface"],
  ["components/orders/quick-order-links.module.css", ".panel"],
  ["components/merchant-admin/merchant-module-console.module.css", ".surface"],
] as const);

test("core admin workspaces do not use decorative outer cards", async () => {
  for (const [path, selector] of OPEN_SURFACES) {
    const body = rule(await source(path), selector);

    assert.match(body, /border:\s*0/, `${path} ${selector}`);
    assert.match(body, /border-radius:\s*0/, `${path} ${selector}`);
    assert.match(body, /background:\s*transparent/, `${path} ${selector}`);
    assert.match(body, /box-shadow:\s*none/, `${path} ${selector}`);
  }
});

const OPEN_PAGE_FRAMES = Object.freeze([
  ["components/orders/order-console.module.css", ".detailHero"],
  ["components/orders/order-drafts.module.css", ".formSection"],
  ["components/customers/customer-console.module.css", ".form"],
  ["components/catalog-onboarding/product-onboarding.module.css", ".page"],
  ["components/settings/payment/payment-settings.module.css", ".methodsPanel"],
  ["components/analytics/panel-analytics.module.css", ".chart"],
] as const);

test("detail form settings and analytics page frames stay open", async () => {
  for (const [path, selector] of OPEN_PAGE_FRAMES) {
    const body = rule(await source(path), selector);

    assert.match(body, /border:\s*0/, `${path} ${selector}`);
    assert.match(body, /border-radius:\s*0/, `${path} ${selector}`);
    assert.match(body, /background:\s*transparent/, `${path} ${selector}`);
    assert.match(body, /box-shadow:\s*none/, `${path} ${selector}`);
  }
});
