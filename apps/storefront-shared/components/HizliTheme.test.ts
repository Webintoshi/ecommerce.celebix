import assert from "node:assert/strict";
import test from "node:test";

const themeUrl = new URL("../themes/hizli-kutu/theme.ts", import.meta.url);
const modelUrl = new URL("../themes/hizli-kutu/model.ts", import.meta.url);
const theme = await import(themeUrl.href).catch(() => ({ hizliThemeFor: () => undefined }));
const model = await import(modelUrl.href).catch(() => ({ packagePieces: () => undefined }));

test("Hızlı Kutu theme is bound to its resolved tenant ID and cannot select a host or another merchant", () => {
  assert.equal(theme.hizliThemeFor({ id: "eae7be09-f362-4681-9df7-18de95eff4cf" }), "hizli-kutu-deniz");
  for (const id of ["", "hizli-kutu", "hizli-kutu.saas-staging.celebix.net", "a828862c-4cc1-475a-89cc-5fbee31eb43f", "ff465e64-1491-40ef-8840-c66281155a1d"])
    assert.equal(theme.hizliThemeFor({ id }), undefined);
});

test("package information uses explicit merchant attributes and never guesses a minimum from a title or stock", () => {
  assert.equal(model.packagePieces({ "Paket içi adet": "250 adet" }), 250);
  assert.equal(model.packagePieces({ "Koli içi adet": "1.000" }), 1000);
  for (const attributes of [{}, { Adet: "250" }, { "Paket içi adet": "0" }, { "Paket içi adet": "2.5" }, { "Paket içi adet": "-250" }, { "Paket içi adet": "250 ile 500" }])
    assert.equal(model.packagePieces(attributes), undefined);
});
