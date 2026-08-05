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
  assert.match(auth, /method="post" action="\/api\/account\/auth\/verify-browser"/u);
  assert.match(auth, /type="hidden" name="ticket"/u);
  assert.match(auth, /type="hidden" name="returnTo"/u);
  assert.match(auth, /name="code"/u);
  assert.match(auth, /Giriş bağlantısı gönder/u);
  assert.match(auth, /Bağlantı 10 dakika geçerlidir/u);
  assert.match(auth, /Kod ile devam et/u);
  assert.doesNotMatch(auth, /publicPost\("\/api\/account\/auth\/verify"|window[.]location[.]assign/u);
  assert.doesNotMatch(auth, /window[.]location[.]assign\(`\/account\/verify/u);
  assert.doesNotMatch(auth, /password/u);
});

test("account entry uses one universal tenant-branded shell without storefront chrome", async () => {
  const login = await source("app/account/login/page.tsx");
  const verify = await source("app/account/verify/page.tsx");
  const shell = await source("components/account/AccountAuthShell.tsx");
  assert.match(login, /AccountAuthShell/u);
  assert.match(verify, /AccountAuthShell/u);
  assert.doesNotMatch(login, /StorefrontFrame|Siparişlerinizi takip edin|Adreslerinizi saklayın/u);
  assert.doesNotMatch(verify, /StorefrontFrame|Bu isteği siz yapmadıysanız/u);
  assert.match(shell, /resolveAccountAuthBranding/u);
  assert.match(shell, /Hesabınız, alışverişiniz[.]/u);
  assert.match(shell, /Mağazaya dön/u);
  assert.match(shell, /aria-label=.*ana sayfa/u);
  assert.match(shell, /--account-brand-ink/u);
  assert.match(login, /Giriş yap veya hesap oluştur/u);
  assert.match(verify, /Güvenli giriş/u);
  assert.match(verify, /ticket=/u);
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
