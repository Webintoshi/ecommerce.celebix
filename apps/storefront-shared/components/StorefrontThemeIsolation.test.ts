import assert from "node:assert/strict";
import test from "node:test";
import { sioraThemeFor } from "../themes/siora/theme.ts";
import { guzideThemeFor } from "../themes/guzide/theme.ts";

test("store themes cannot cross resolved tenant boundaries", () => {
  const siora = { id: "ff465e64-1491-40ef-8840-c66281155a1d" };
  const guzide = { id: "a828862c-4cc1-475a-89cc-5fbee31eb43f" };
  assert.equal(sioraThemeFor(siora), "siora-deniz");
  assert.equal(guzideThemeFor(siora), undefined);
  assert.equal(guzideThemeFor(guzide), "guzide-deniz");
  assert.equal(sioraThemeFor(guzide), undefined);
  for (const id of ["", "butik-siora", "butik-siora.saas-staging.celebix.net", "ff465e64-1491-40ef-8840-c66281155a1e"]) {
    assert.equal(sioraThemeFor({ id }), undefined);
    assert.equal(guzideThemeFor({ id }), undefined);
  }
});
