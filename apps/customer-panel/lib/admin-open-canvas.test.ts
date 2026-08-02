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
