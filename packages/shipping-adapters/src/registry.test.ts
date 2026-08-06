import assert from "node:assert/strict";
import test from "node:test";

import { resolveShippingProviderAdapter } from "./index.ts";

test("registry contains only the reviewed provider", () => {
  assert.equal(resolveShippingProviderAdapter("basit_kargo").providerCode, "basit_kargo");
  assert.throws(
    () => resolveShippingProviderAdapter("shipentegra" as never),
    /shipping_provider_not_registered/u,
  );
});
