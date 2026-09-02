import assert from "node:assert/strict";
import test from "node:test";

import { approvedPanelMutationOrigin, approvedPanelMutationOriginForStore } from "./panel-origin-authority.ts";

const CENTRAL = "https://panel.saas-staging.celebix.site";
const CUSTOM = "https://admin.guzidekuyumcu.com.tr";

test("accepts an exact custom admin same-origin mutation on the direct Host", () => {
  const request = new Request("http://customer-panel:3400/api/catalog/products", { method: "POST", headers: { host: "admin.guzidekuyumcu.com.tr", origin: CUSTOM } });
  assert.equal(approvedPanelMutationOrigin(request, CENTRAL), true);
  assert.equal(approvedPanelMutationOriginForStore(request, CENTRAL, "guzide-kuyumcu-4"), true);
});

test("never rescues a foreign origin with forwarded-host headers", () => {
  const request = new Request("http://customer-panel:3400/api/catalog/products", { method: "POST", headers: {
    host: "admin.guzidekuyumcu.com.tr", origin: "https://attacker.example",
    "x-forwarded-host": "admin.guzidekuyumcu.com.tr", forwarded: "host=admin.guzidekuyumcu.com.tr;proto=https",
  } });
  assert.equal(approvedPanelMutationOrigin(request, CENTRAL), false);
  assert.equal(approvedPanelMutationOriginForStore(request, CENTRAL, "guzide-kuyumcu-4"), false);
});
