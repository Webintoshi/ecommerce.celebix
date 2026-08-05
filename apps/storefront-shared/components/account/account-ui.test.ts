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
  assert.match(auth, /Bağlantı gönder/u);
  assert.match(auth, /Şifre gerekmez/u);
  assert.match(auth, /E-postanı kontrol et/u);
  assert.match(auth, /maskAccountEmail/u);
  assert.match(auth, /E-postayı değiştir/u);
  assert.match(auth, /Kod ile giriş/u);
  assert.match(auth, />Devam et</u);
  assert.match(auth, />Giriş yap</u);
  assert.doesNotMatch(auth, /Bağlantı 10 dakika geçerlidir|<b>\{email\}<\/b>/u);
  assert.doesNotMatch(auth, /publicPost\("\/api\/account\/auth\/verify"|window[.]location[.]assign/u);
  assert.doesNotMatch(auth, /window[.]location[.]assign\(`\/account\/verify/u);
  assert.doesNotMatch(auth, /password/u);
});

test("account entry uses one universal tenant-branded shell without storefront chrome", async () => {
  const login = await source("app/account/login/page.tsx");
  const verify = await source("app/account/verify/page.tsx");
  const shell = await source("components/account/AccountAuthShell.tsx");
  const form = await source("components/account/AccountAuthForm.tsx");
  assert.match(login, /AccountAuthShell/u);
  assert.match(verify, /AccountAuthShell/u);
  assert.doesNotMatch(login, /StorefrontFrame|Siparişlerinizi takip edin|Adreslerinizi saklayın/u);
  assert.doesNotMatch(verify, /StorefrontFrame|Bu isteği siz yapmadıysanız/u);
  assert.match(shell, /resolveAccountAuthBranding/u);
  assert.match(shell, /Alışverişiniz, kaldığınız yerden[.]/u);
  assert.match(shell, /Mağazaya dön/u);
  assert.match(shell, /aria-label=.*ana sayfa/u);
  assert.doesNotMatch(shell, /--account-brand-ink/u);
  assert.match(shell, /account-auth[.]module[.]css/u);
  assert.match(form, /account-auth[.]module[.]css/u);
  assert.match(login, /Giriş yap veya hesap oluştur/u);
  assert.match(verify, /Güvenli giriş/u);
  assert.match(verify, /ticket=/u);
});

test("universal account auth layout is responsive accessible and locally scoped", async () => {
  const css = await source("components/account/account-auth.module.css");
  const globalCss = await source("app/globals.css");
  assert.match(css, /grid-template-columns:\s*minmax\(0, 46fr\) minmax\(0, 54fr\)/u);
  assert.match(css, /min-height:\s*100svh/u);
  assert.match(css, /max-width:\s*380px/u);
  assert.doesNotMatch(css, /--account-brand-ink/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(max-width: 760px\)/u);
  assert.match(css, /max-height:\s*36svh/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /--auth-brand-surface:\s*color-mix\(in srgb, var\(--store-primary\) 14%, #f7f7f5\)/u);
  assert.match(css, /background:\s*var\(--auth-brand-surface\)/u);
  assert.match(css, /[.]primaryButton\s*\{[^}]*background:\s*#171717[^}]*color:\s*#fff/su);
  assert.match(css, /font-size:\s*clamp\(38px, 5vw, 68px\)/u);
  assert.match(css, /font-size:\s*clamp\(30px, 9vw, 40px\)/u);
  assert.match(css, /font-size:\s*clamp\(28px, 3vw, 36px\)/u);
  assert.match(css, /font-size:\s*clamp\(27px, 8vw, 34px\)/u);
  assert.doesNotMatch(css, /[.]brand\s*\{[^}]*background:\s*var\(--store-primary\)/su);
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
