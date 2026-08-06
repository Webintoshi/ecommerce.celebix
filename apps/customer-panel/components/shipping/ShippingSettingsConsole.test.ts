import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const COMPONENT = new URL("./ShippingSettingsConsole.tsx", import.meta.url);
const CSS = new URL("./shipping-settings.module.css", import.meta.url);
const PAGE = new URL("../../app/settings/shipping/page.tsx", import.meta.url);

test("shipping settings replaces the generic record console with the dedicated workspace", async () => {
  const page = await readFile(PAGE, "utf8");
  assert.match(page, /ShippingSettingsConsole/u);
  assert.doesNotMatch(page, /MerchantModuleConsole|shipping_setting/u);
});

test("shipping UI exposes one concise Basit Kargo connection and resource workflow", async () => {
  const source = await readFile(COMPONENT, "utf8");
  for (const token of ["Basit Kargo", "Bağla", "Değiştir", "Bağlantıyı kaldır", "Gönderici marka", "Çıkış adresi", "Kapıda ödeme"]) {
    assert.match(source, new RegExp(token, "u"));
  }
  assert.match(source, /type="password"/u);
  assert.match(source, /autoComplete="new-password"/u);
  assert.match(source, /aria-live="polite"/u);
  assert.doesNotMatch(source, /<h1/u);
});

test("shipping settings stays flat and responsive", async () => {
  const css = await readFile(CSS, "utf8");
  assert.match(css, /border-bottom/u);
  assert.match(css, /@media/u);
  assert.doesNotMatch(css, /box-shadow/u);
  assert.doesNotMatch(css, /\.card\b/u);
});
