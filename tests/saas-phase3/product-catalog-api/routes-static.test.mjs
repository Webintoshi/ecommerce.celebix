import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const files = new Map([
  ["apps/customer-panel/app/api/catalog/products/route.ts", ["GET", "POST"]],
  ["apps/customer-panel/app/api/catalog/products/[productId]/route.ts", ["GET", "PATCH"]],
  ["apps/customer-panel/app/api/catalog/products/[productId]/archive/route.ts", ["POST"]],
  ["apps/customer-panel/app/api/catalog/products/[productId]/variants/route.ts", ["POST"]],
  ["apps/customer-panel/app/api/catalog/products/[productId]/variants/[variantId]/route.ts", ["PATCH"]],
  ["apps/customer-panel/app/api/catalog/products/[productId]/variants/[variantId]/archive/route.ts", ["POST"]],
]);

test("catalog routes mount exactly the approved methods through default server-only handlers", () => {
  for (const [file, methods] of files) {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    assert.match(source, /lib\/catalog-http\/default\.ts/);
    for (const method of methods) assert.match(source, new RegExp(`export const ${method} = handleDefaultCatalog`));
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
      assert.equal(new RegExp(`export const ${method} =`).test(source), methods.includes(method), `${file}:${method}`);
    }
    assert.doesNotMatch(source, /process\.env|\bpg\b|postgres|SELECT|INSERT|UPDATE\s+saas\.|DELETE FROM|cookie|authorization|idempotency|secret|keyId/i);
  }
});

test("default catalog handlers reuse only the shared catalog runtime and server-generated request IDs", () => {
  const source = readFileSync(path.join(ROOT, "apps/customer-panel/lib/catalog-http/default.ts"), "utf8");
  assert.match(source, /resolveDefaultServerCatalogRuntime/);
  assert.match(source, /createCatalogHttpHandlers/);
  assert.match(source, /randomUUID/);
  assert.doesNotMatch(source, /\bpg\b|new Pool|process\.env|connectionString|DATABASE_URL/i);
});
