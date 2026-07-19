import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
test("product media routes delegate to server-owned authenticated handlers", () => { for (const file of ["apps/customer-panel/app/api/catalog/products/[productId]/media/route.ts","apps/customer-panel/app/api/catalog/products/[productId]/media/[mediaId]/route.ts","apps/customer-panel/app/api/catalog/products/[productId]/media/[mediaId]/archive/route.ts","apps/customer-panel/app/api/catalog/products/[productId]/media/reorder/route.ts"]) { const source = read(file); assert.match(source, /defaultProductMediaHttpHandlers/); assert.doesNotMatch(source, /process\.env|x-store-id|database|r2_access/i); } });
test("media handler namespaces storage from authenticated TenantContext", () => { const source = read("apps/customer-panel/lib/media-http/handler.ts"); assert.match(source, /tenantContext\.store\.id/); assert.match(source, /stores\/\$\{storeId\}\/products/); assert.doesNotMatch(source, /headers\.get\(["'](?:x-store-id|x-tenant-id)/i); });
