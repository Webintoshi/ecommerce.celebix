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
});

test("page shell exports the fixed Hemenaku-derived primitive set without donor imports", async () => {
  const pageShell = await source("components/panel/PanelPageShell.tsx");
  for (const name of [
    "PanelPageShell", "PanelPageHeader", "PanelPanel", "PanelToolbar", "PanelBadge",
    "PanelStatusBadge", "PanelMetricCard", "PanelDataTable", "PanelLoadingState",
    "PanelActionButton", "PanelEmptyState",
  ]) assert.match(pageShell, new RegExp("export function " + name));
  assert.doesNotMatch(pageShell, /apps\/admin|@\/components\/admin|\/api\/admin|supabase/i);
});
