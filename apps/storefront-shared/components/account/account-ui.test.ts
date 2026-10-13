import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }

test("account auth styles keep focus and reduced-motion support local to the shared screen", async () => {
  const css = await source("components/account/account-auth.module.css");
  const globalCss = await source("app/globals.css");
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.doesNotMatch(globalCss, /[.]account-auth-(?:layout|intro|form|benefits|sent|confirmation|secondary|text|verify|trust|footnote)/u);
});

test("account dashboard exposes working shopper destinations without private authority", async () => {
  const dashboard = await source("components/account/AccountDashboard.tsx");
  for (const path of ["/account/orders", "/account/addresses", "/account/profile", "/account/security", "/favorites"]) assert.match(dashboard, new RegExp(path));
  assert.match(dashboard, /recentOrders/u);
  assert.doesNotMatch(dashboard, /tenantId|storeId|accountId|customerId/u);
  const css = await source("app/globals.css");
  assert.match(css, /\.account-page/u);
  assert.match(css, /@media \(max-width: 640px\)/u);
});
