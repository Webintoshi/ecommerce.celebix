import assert from "node:assert/strict";
import test from "node:test";

const url = new URL("../themes/ezmeo/theme.ts", import.meta.url);
const theme = await import(url.href).catch(() => ({ ezmeoThemeFor: () => undefined }));

test("Ezmeo is selected by resolved store identity, never name or hostname", () => {
  assert.equal(theme.ezmeoThemeFor({ id: "7892a771-67a9-42d7-9b36-f4c3e8562e95" }), "ezmeo-deniz");
  for (const id of ["", "ezmeo", "ezmeo.com", "ezmeo.saas-staging.celebix.net", "a828862c-4cc1-475a-89cc-5fbee31eb43f", "eae7be09-f362-4681-9df7-18de95eff4cf"])
    assert.equal(theme.ezmeoThemeFor({ id, name: "Ezmeo", hostname: "ezmeo.com" }), undefined);
});
