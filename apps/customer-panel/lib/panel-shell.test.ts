import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("topbar chrome exposes a provider, page bridge, and dedicated action portal", async () => {
  const topbar = await source("components/panel/PanelTopbarChrome.tsx");
  assert.match(topbar, /PanelTopbarChromeProvider/);
  assert.match(topbar, /PanelTopbarBridge/);
  assert.match(topbar, /panel-topbar-actions/);
  assert.match(topbar, /createPortal/);
  assert.match(topbar, /new Map<symbol, PanelTopbarChromeSnapshot>/);
  assert.match(topbar, /const owner = Symbol\("panel-topbar-owner"\)/);
  assert.match(topbar, /return Object\.freeze\(/);
  assert.match(topbar, /const wasActive = \[\.\.\.registrations\.keys\(\)\]\.at\(-1\) === owner/);
  assert.match(topbar, /registrations\.delete\(owner\)/);
  assert.match(topbar, /\[\.\.\.registrations\.values\(\)\]\.at\(-1\) \?\? null/);
  assert.match(topbar, /publish\(\{ title: state\.title, subtitle: state\.subtitle \}\)/);
  assert.doesNotMatch(topbar, /publish\(\{[^}]*actions/s);
});

test("page shell exports the fixed Hemenaku-derived primitive set without donor imports", async () => {
  const pageShell = await source("components/panel/PanelPageShell.tsx");
  const styles = await source("components/panel/panel-shell.module.css");
  for (const name of [
    "PanelPageShell", "PanelPageHeader", "PanelPanel", "PanelToolbar", "PanelBadge",
    "PanelStatusBadge", "PanelMetricCard", "PanelDataTable", "PanelLoadingState",
    "PanelActionButton", "PanelEmptyState",
  ]) assert.match(pageShell, new RegExp("export function " + name));
  assert.doesNotMatch(pageShell, /apps\/admin|@\/components\/admin|\/api\/admin|supabase/i);
  assert.match(pageShell, /styles\.pageActions/);
  assert.match(styles, /\.pageActions,[\s\S]*?display: flex/);
  assert.match(
    styles,
    /@media \(min-width: 1025px\)\s*\{\s*\.pageActions\s*\{\s*display: none;\s*\}\s*\}/,
  );
});
