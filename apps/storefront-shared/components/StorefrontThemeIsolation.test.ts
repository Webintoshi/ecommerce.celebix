import assert from "node:assert/strict";
import test from "node:test";
import { sioraThemeFor } from "../themes/siora/theme.ts";
import { guzideThemeFor } from "../themes/guzide/theme.ts";
import { alplerThemeFor } from "../themes/alpler/theme.ts";
import { checkoutVisualThemeFor } from "../lib/checkout-visual-theme.ts";

test("store themes cannot cross resolved tenant boundaries", () => {
  const siora = { id: "ff465e64-1491-40ef-8840-c66281155a1d" };
  const guzide = { id: "a828862c-4cc1-475a-89cc-5fbee31eb43f" };
  assert.equal(sioraThemeFor(siora), "siora-deniz");
  assert.equal(guzideThemeFor(siora), undefined);
  assert.equal(guzideThemeFor(guzide), "guzide-deniz");
  assert.equal(sioraThemeFor(guzide), undefined);
  const alpler = { id: "9f1f6aed-8719-407e-b64c-fd8e956d3277" };
  assert.equal(alplerThemeFor(alpler), "alpler-deniz");
  assert.equal(sioraThemeFor(alpler), undefined);
  assert.equal(guzideThemeFor(alpler), undefined);
  assert.equal(alplerThemeFor(siora), undefined);
  assert.equal(alplerThemeFor(guzide), undefined);
  for (const id of ["", "butik-siora", "butik-siora.saas-staging.celebix.net", "ff465e64-1491-40ef-8840-c66281155a1e"]) {
    assert.equal(sioraThemeFor({ id }), undefined);
    assert.equal(guzideThemeFor({ id }), undefined);
    assert.equal(alplerThemeFor({ id }), undefined);
  }
  assert.equal(alplerThemeFor({ id: "alpler-spor" }), undefined);
  assert.equal(alplerThemeFor({ id: "alpler-spor.saas-staging.celebix.net" }), undefined);
  assert.equal(alplerThemeFor({ id: "9f1f6aed-8719-407e-b64c-fd8e956d3278" }), undefined);
});

test("all resolved stores use the shared checkout without assigning another store's theme", () => {
  for (const id of [
    "9f1f6aed-8719-407e-b64c-fd8e956d3277",
    "a828862c-4cc1-475a-89cc-5fbee31eb43f",
    "ff465e64-1491-40ef-8840-c66281155a1d",
    "future-store-id",
    "9f1f6aed-8719-407e-b64c-fd8e956d3278",
  ]) assert.equal(checkoutVisualThemeFor({ id }), "shared-checkout");
});
