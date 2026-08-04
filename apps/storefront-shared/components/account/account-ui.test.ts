import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, root), "utf8"); }

test("customer account forms are accessible and use the passwordless private routes", async () => {
  const auth = await source("components/account/AccountAuthForm.tsx");
  assert.match(auth, /type="email"/u);
  assert.match(auth, /autoComplete="email"/u);
  assert.match(auth, /inputMode="numeric"/u);
  assert.match(auth, /autoComplete="one-time-code"/u);
  assert.match(auth, /role="status"/u);
  assert.match(auth, /\/api\/account\/auth\/start/u);
  assert.match(auth, /\/api\/account\/auth\/verify/u);
  assert.doesNotMatch(auth, /password/u);
});

test("account dashboard exposes working shopper destinations without private authority", async () => {
  const dashboard = await source("components/account/AccountDashboard.tsx");
  for (const path of ["/account/orders", "/account/addresses", "/account/profile", "/account/security", "/favorites"]) assert.match(dashboard, new RegExp(path));
  assert.match(dashboard, /recentOrders/u);
  assert.doesNotMatch(dashboard, /tenantId|storeId|accountId|customerId/u);
  const css = await source("app/globals.css");
  assert.match(css, /\.account-auth-layout/u);
  assert.match(css, /@media \(max-width: 640px\)/u);
});
