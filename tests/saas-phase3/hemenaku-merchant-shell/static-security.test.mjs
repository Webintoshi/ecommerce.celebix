import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "d020e96c6a7e5336e64d586683985fd6bf4f354e";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

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
  assert.equal(git("diff", "--name-only", BASE + "...HEAD", "--", "apps/admin"), "");
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

test("contains no unsupported navigation or dashboard claims", async () => {
  const combined = (await Promise.all([
    "apps/customer-panel/lib/panel-ui/navigation.ts",
    "apps/customer-panel/lib/panel-ui/dashboard-model.ts",
    "apps/customer-panel/components/dashboard/PanelDashboardHomeView.tsx",
  ].map(read))).join("\n");
  assert.doesNotMatch(combined, /orders|sipariş|customers|müşteri|marketing|cms|accounting|muhasebe|seo|toshi|notification|revenue|ciro|conversion|analytics/i);
});

test("preserves exact same-origin logout semantics", async () => {
  const logout = await read("apps/customer-panel/components/panel/LogoutButton.tsx");
  assert.match(logout, /\/api\/session\/logout/);
  assert.match(logout, /method:\s*["']POST["']/);
  assert.match(logout, /credentials:\s*["']same-origin["']/);
  assert.doesNotMatch(logout, /document\.cookie|localStorage|sessionStorage/);
});

test("adds only the direct lucide dependency and nested panel ui test glob", async () => {
  const pkg = JSON.parse(await read("apps/customer-panel/package.json"));
  assert.match(pkg.dependencies["lucide-react"], /^\^0\.563\./);
  assert.equal(pkg.scripts.test, "node --experimental-transform-types --test lib/*.test.ts lib/panel-ui/*.test.ts");
});

test("does not change deploy production or infrastructure files", () => {
  const changed = git("diff", "--name-only", BASE + "...HEAD").split("\n").filter(Boolean);
  assert.equal(changed.some((path) => /^(deploy|infra|infrastructure|apps\/admin)\//.test(path)), false);
});
