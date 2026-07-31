import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const up = readFileSync(path.join(SQL, "202607310072_storefront_cart_checkout.up.sql"), "utf8");
const down = readFileSync(path.join(SQL, "202607310072_storefront_cart_checkout.down.sql"), "utf8");

test("commerce authority stores credential digests and never raw credentials", () => {
  assert.match(up, /credential_digest/);
  assert.doesNotMatch(up, /raw_credential|credential_value|credential_secret/i);
});

test("public workflows require trusted host authority and finite credential candidates", () => {
  assert.match(up, /public_storefront_authorized/);
  assert.match(up, /BETWEEN 1 AND 16|<=\s*16/);
  assert.doesNotMatch(up, /x-forwarded|forwarded|referer|origin header/i);
});

test("checkout owns price stock payment and inventory authority", () => {
  assert.match(up, /resolve_effective_variant_price/);
  assert.match(up, /checkout_sale/);
  assert.match(up, /built_in_payment_method_config_valid/);
  assert.match(up, /FOR UPDATE/);
});

test("runtime roles cannot access commerce tables directly", () => {
  assert.match(up, /FORCE ROW LEVEL SECURITY/g);
  assert.match(up, /REVOKE ALL ON saas\.storefront_carts/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.public_cart_resolve/);
  assert.doesNotMatch(up, /GRANT (SELECT|INSERT|UPDATE|DELETE).*celebix_saas_(app|host_resolver)/i);
});

test("rollback is scoped to migration 072", () => {
  assert.match(down, /DROP TABLE saas\.storefront_carts/);
  assert.doesNotMatch(down, /DROP TABLE saas\.(orders|customers|products|payment_methods)/);
});
