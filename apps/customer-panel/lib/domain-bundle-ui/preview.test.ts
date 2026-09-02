import assert from "node:assert/strict";
import test from "node:test";

import { previewDomainBundle } from "./preview.ts";

for (const [raw, storefront, admin] of [
  ["example.com", "example.com", "admin.example.com"],
  ["https://www.example.com", "www.example.com", "admin.example.com"],
  ["shop.example.co.uk", "shop.example.co.uk", "admin.example.co.uk"],
  ["WWW.Örnek.com", "www.xn--rnek-4qa.com", "admin.xn--rnek-4qa.com"],
] as const) {
  test(`previews the server-authoritative storefront/admin bundle for ${raw}`, () => {
    assert.deepEqual(previewDomainBundle(raw), { storefront, admin });
  });
}

for (const raw of ["", "https://example.com/path", "localhost", "admin.example.com", "example.invalid"] as const) {
  test(`does not preview an unsafe bundle input: ${raw}`, () => assert.equal(previewDomainBundle(raw), null));
}
