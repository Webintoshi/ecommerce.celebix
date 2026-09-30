import assert from "node:assert/strict";
import test from "node:test";

import { guzideThemeFor } from "../themes/guzide/theme.ts";

test("Güzide's visual theme follows only its resolved tenant identity", () => {
  assert.equal(guzideThemeFor({ id: "a828862c-4cc1-475a-89cc-5fbee31eb43f" }), "guzide-deniz");
  assert.equal(guzideThemeFor({ id: "another-active-store" }), undefined);
  assert.equal(guzideThemeFor({ id: "" }), undefined);
});
