import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "d020e96c6a7e5336e64d586683985fd6bf4f354e";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const HISTORICAL_A1_HEAD = "dcb8ad4e57653a53098f082e57fc5b2a1c5ec113";
const NEXT_SECURITY_HEAD = "ce3a2e0a14d0ab15e10b98b33b4f5e7d0eeeb043";
const ROOT = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const readAt = (revision, path) => git("show", `${revision}:${path}`);

test("pins the exact donor commit and required donor files", () => {
  assert.equal(git("rev-parse", DONOR + "^{commit}"), DONOR);
  for (const path of [
    "apps/admin/app/globals.css",
    "apps/admin/app/admin/AdminLayoutClient.tsx",
    "apps/admin/components/admin/AdminSidebar.tsx",
    "apps/admin/components/admin/AdminTopbarChrome.tsx",
    "apps/admin/components/admin/AdminPageShell.tsx",
    "apps/admin/components/admin/dashboard/DashboardHomeView.tsx",
  ]) assert.doesNotThrow(() => git("cat-file", "-e", DONOR + ":" + path));
});

test("keeps apps admin byte-unchanged from the implementation base", () => {
  assert.equal(git("rev-parse", `${NEXT_SECURITY_HEAD}^{commit}`), NEXT_SECURITY_HEAD);
  assert.equal(git("diff", "--name-only", `${BASE}...${NEXT_SECURITY_HEAD}`, "--", "apps/admin"), "apps/admin/package.json");
  assert.equal(git("diff", "--name-only", `${NEXT_SECURITY_HEAD}...HEAD`, "--", "apps/admin"), "");
});

test("never sends full TenantContext or authority identifiers into client modules", async () => {
  const combined = (await Promise.all([
    "apps/customer-panel/components/panel/PanelLayoutClient.tsx",
    "apps/customer-panel/components/panel/PanelSidebar.tsx",
    "apps/customer-panel/components/panel/PanelNavigation.tsx",
    "apps/customer-panel/components/panel/PanelMobileDock.tsx",
    "apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx",
  ].map(read))).join("\n");
  assert.doesNotMatch(combined, /TenantContext|principal|issuer|subject|storeId|membershipId|planId|domainId|requestId/);
});

test("imports no donor auth data runtime or legacy admin API", async () => {
  const files = git("diff", "--name-only", BASE + "...HEAD", "--", "apps/customer-panel").split("\n").filter(Boolean);
  const implementation = files.filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.[cm]?[jt]sx?$/.test(file));
  const combined = (await Promise.all(implementation.map(read))).join("\n");
  assert.doesNotMatch(combined, /@supabase|getAdminAuthContext|getBrowserSupabaseClient|NEXT_PUBLIC_ADMIN_AUTH_PROVIDER|\/api\/admin\/|store-runtime|store-info-context/i);
});

test("preserves the historical A1 orders navigation snapshot at its closing SHA", () => {
  const navigation = readAt(HISTORICAL_A1_HEAD, "apps/customer-panel/lib/panel-ui/navigation.ts");
  const dashboardModel = readAt(HISTORICAL_A1_HEAD, "apps/customer-panel/lib/panel-ui/dashboard-model.ts");
  const dashboard = readAt(HISTORICAL_A1_HEAD, "apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx");
  assert.match(navigation, /label:\s*"Siparişler"[\s\S]*?label:\s*"Tüm Siparişler"[\s\S]*?href:\s*"\/orders"/);
  assert.doesNotMatch(navigation, /quick|abandoned|customers|müşteri|marketing|cms|accounting|muhasebe|seo|toshi|notification|conversion|analytics/i);
  for (const capability of ["analytics", "customers", "carts"]) {
    assert.match(dashboardModel, new RegExp(`unsupportedAuthority\\(\\"${capability}\\"\\)`));
  }
  assert.match(dashboardModel, /orders:\s*AuthoritySlice<OrderDashboardSummary>\s*=\s*unsupportedAuthority\("orders"\)/);
  assert.match(dashboard, /dashboard\.orders\.value\.totalOrders/);
  assert.equal((dashboard.match(/aria-disabled="true"/g) ?? []).length >= 2, true);
  assert.doesNotMatch(dashboard, /href=[^\n]*(?:analytics|customers|carts|quick|abandoned)/i);
});

test("preserves exact same-origin logout semantics", async () => {
  const logout = await read("apps/customer-panel/components/panel/LogoutButton.tsx");
  assert.match(logout, /\/api\/session\/logout/);
  assert.match(logout, /method:\s*["']POST["']/);
  assert.match(logout, /credentials:\s*["']same-origin["']/);
  assert.doesNotMatch(logout, /document\.cookie|localStorage|sessionStorage/);
});

test("preserves the historical shell dependency and test-glob snapshot", () => {
  const pkg = JSON.parse(readAt(HISTORICAL_A1_HEAD, "apps/customer-panel/package.json"));
  assert.deepEqual({
    "framer-motion": pkg.dependencies["framer-motion"],
    "lucide-react": pkg.dependencies["lucide-react"],
    recharts: pkg.dependencies.recharts,
  }, {
    "framer-motion": "^12.29.0",
    "lucide-react": "^0.563.0",
    recharts: "^3.7.0",
  });
  assert.equal(pkg.dependencies.sonner, undefined);
  assert.equal(pkg.dependencies["@supabase/ssr"], undefined);
  assert.equal(pkg.dependencies["@supabase/supabase-js"], undefined);
  assert.equal(pkg.scripts.test, "node --experimental-transform-types --test lib/*.test.ts lib/panel-ui/*.test.ts");
});

test("shell breakpoint and accessibility controls are exact", async () => {
  const layout = await read("apps/customer-panel/components/panel/PanelLayoutClient.tsx");
  const sidebar = await read("apps/customer-panel/components/panel/PanelSidebar.tsx");
  const dock = await read("apps/customer-panel/components/panel/PanelMobileDock.tsx");
  const css = await read("apps/customer-panel/components/panel/panel-shell.module.css");
  assert.match(layout, /matchMedia\(["']\(min-width: 1025px\)["']\)/);
  assert.match(sidebar, /event\.key === "Escape"/);
  assert.match(sidebar, /aria-modal="true"/);
  assert.match(sidebar, /touchCurrent\.current - touchStart\.current >= 64/);
  assert.match(sidebar, /import Image from "next\/image"/);
  assert.match(sidebar, /src="\/Logo\/celebix-beyaz-logo\.svg"/);
  assert.match(sidebar, /<AnimatePresence onExitComplete=\{handleDrawerExitComplete\}>/);
  assert.match(sidebar, /<motion\.button[\s\S]*?initial=\{\{ opacity: 0 \}\}[\s\S]*?exit=\{\{ opacity: 0 \}\}/);
  assert.match(sidebar, /useReducedMotion\(\)/);
  assert.match(sidebar, /reduceMotion \? 0\.00001 : 0\.2/);
  assert.match(sidebar, /<motion\.aside[\s\S]*?initial=\{\{ x: "100%" \}\}[\s\S]*?exit=\{\{ x: "100%" \}\}/);
  assert.match(dock, /aria-controls="panel-mobile-drawer"/);
  assert.match(css, /@media\s*\(min-width:\s*1025px\)/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /--panel-keyboard-inset/);
  assert.doesNotMatch(css, /\.drawerSurface\s*\{[^}]*transition:\s*transform/);
});

test("does not change deploy production or infrastructure files", () => {
  const protectedRoots = ["apps/admin", "deploy", "infra", "infrastructure"];
  assert.deepEqual(
    git("diff", "--name-only", `${BASE}...${NEXT_SECURITY_HEAD}`, "--", ...protectedRoots).split("\n").filter(Boolean),
    ["apps/admin/package.json"],
  );
  assert.equal(git("diff", "--name-only", `${NEXT_SECURITY_HEAD}...HEAD`, "--", ...protectedRoots), "");
});
