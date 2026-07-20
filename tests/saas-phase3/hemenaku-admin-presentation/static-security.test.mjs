import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BASE = "6563a1428434e1974f50af3ffb843eb4067f686a";
const DONOR = "fc6c5318b47f045a7cefcedc7612d5b10563ba32";
const ROOT = new URL("../../../", import.meta.url);
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const read = (path) => readFile(new URL(path, ROOT), "utf8");
const readBytes = (path) => readFile(new URL(path, ROOT));

test("pins the donor and leaves apps admin byte unchanged", () => {
  assert.equal(git("rev-parse", `${DONOR}^{commit}`), DONOR);
  assert.equal(git("diff", "--name-only", `${BASE}...HEAD`, "--", "apps/admin"), "");
});

test("declares only the approved presentation dependencies", async () => {
  const pkg = JSON.parse(await read("apps/customer-panel/package.json"));
  assert.equal(pkg.dependencies["framer-motion"], "^12.29.0");
  assert.equal(pkg.dependencies.recharts, "^3.7.0");
  assert.equal(pkg.dependencies.sonner, undefined);
  assert.equal(pkg.dependencies["@supabase/ssr"], undefined);
  assert.equal(pkg.dependencies["@supabase/supabase-js"], undefined);
});

test("keeps production deploy infrastructure and donor outside the diff", () => {
  const changed = git("diff", "--name-only", `${BASE}...HEAD`).split("\n").filter(Boolean);
  assert.equal(changed.some((path) => /^(apps\/admin|apps\/owner|deploy|infra|infrastructure)\//.test(path)), false);
});

test("ports the exact donor brand asset and core visual tokens", async () => {
  const donorLogo = execFileSync("git", ["show", `${DONOR}:apps/admin/public/Logo/celebix-beyaz-logo.svg`], { cwd: ROOT });
  const targetLogo = await readBytes("apps/customer-panel/public/Logo/celebix-beyaz-logo.svg");
  assert.deepEqual(targetLogo, donorLogo);
  const css = await read("apps/customer-panel/app/globals.css");
  assert.match(css, /--hemenaku-orange:\s*#FF6A00/i);
  assert.match(css, /--hemenaku-sidebar:\s*#2A2A2A/i);
  assert.match(css, /--panel-touch-target:\s*48px/i);
});

test("exports the complete donor-compatible page primitive set", async () => {
  const source = await read("apps/customer-panel/components/panel/PanelPageShell.tsx");
  for (const name of ["PanelPageShell", "PanelPageHeader", "PanelPanel", "PanelToolbar", "PanelBadge", "PanelStatusBadge", "PanelMetricCard", "PanelDataTable", "PanelLoadingState", "PanelActionButton", "PanelEmptyState", "PanelSkeletonBlock"]) {
    assert.match(source, new RegExp(`export function ${name}\\b`));
  }
});
