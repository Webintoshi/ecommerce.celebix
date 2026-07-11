import assert from "node:assert/strict";
import test from "node:test";

import { createPanelStoreUrl, normalizeExactHttpsOrigin } from "./panel-origin.ts";

test("exact HTTPS origins accept canonical roots and normalize one trailing slash", () => {
  assert.equal(normalizeExactHttpsOrigin("https://panel.celebix.site"), "https://panel.celebix.site");
  assert.equal(normalizeExactHttpsOrigin("https://panel.example.test/"), "https://panel.example.test");
  assert.equal(createPanelStoreUrl("https://panel.example.test/", "tenant-a"), "https://panel.example.test/stores/tenant-a");
});

test("exact HTTPS origins reject authority, path, encoding, and protocol ambiguity", () => {
  for (const value of [
    "http://panel.example.test",
    "https://user:password@panel.example.test",
    "https://panel.example.test?query=1",
    "https://panel.example.test#fragment",
    "https://panel.example.test/path",
    "https://panel.example.test//",
    "https://panel.example.test/%2Fconfused",
    "https://panel.example.test/path/extra",
    "/relative",
    "not a url",
    "https:///empty-host",
    "",
  ]) assert.throws(() => normalizeExactHttpsOrigin(value), /invalid_exact_https_origin/, value);
});
