import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const themeUrl = new URL("../../branding/logto/celebix-auth-theme.css", import.meta.url);

test("Celebix Logto theme keeps the approved visual and accessibility contract", async () => {
  const css = await readFile(themeUrl, "utf8");

  assert.match(css, /#app\s*\{/);
  assert.match(css, /--celebix-brand:\s*#FE6100/i);
  assert.match(css, /--celebix-brand-pressed:\s*#D95200/i);
  assert.match(css, /--celebix-text:\s*#2B2B2B/i);
  assert.match(css, /--celebix-canvas:\s*#F4F4F8/i);
  assert.match(css, /#app\s+main\[class\*=['"]main['"]\]/);
  assert.match(css, /#app\s+button\[type=['"]submit['"]\]/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /forced-colors:\s*active/);
});

test("Celebix Logto theme contains presentation CSS only", async () => {
  const css = await readFile(themeUrl, "utf8");

  assert.doesNotMatch(
    css,
    /javascript:|<script|@import|data:|bearer\s+|password|api[_-]?key|client[_-]?secret|\.celebix\.site|app_id/iu,
  );
});
