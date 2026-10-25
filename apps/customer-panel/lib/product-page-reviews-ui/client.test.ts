import assert from "node:assert/strict";
import test from "node:test";
import { createProductPageReviewSettingsClient, ProductPageReviewSettingsApiError } from "./client.ts";
const PATH = "/api/catalog/admin/product-page-reviews/settings", OP = "71000000-0000-4000-8000-000000000001";
test("review writing settings client uses exact same-origin no-store endpoints and caller-owned operation", async () => {
  const calls: any[] = [];
  const client = createProductPageReviewSettingsClient(async (path, init) => { calls.push([path, init]); return Response.json(calls.length === 1 ? { enabled: false, version: 0 } : { enabled: true, version: 1 }); });
  assert.deepEqual(await client.get(), { enabled: false, version: 0 }); assert.deepEqual(await client.save({ expectedVersion: 0, enabled: true }, OP), { enabled: true, version: 1 });
  assert.deepEqual(calls[0], [PATH, { credentials: "same-origin", cache: "no-store", method: "GET" }]);
  assert.deepEqual(calls[1], [PATH, { credentials: "same-origin", cache: "no-store", method: "POST", headers: { "content-type": "application/json", "idempotency-key": OP }, body: JSON.stringify({ expectedVersion: 0, enabled: true }) }]);
});
test("review writing settings client rejects malformed responses and keeps finite conflict identity", async () => {
  for (const body of [{ enabled: true, version: -1 }, { enabled: "true", version: 0 }, { enabled: true, version: 1, storeId: OP }, { settings: { enabled: true, version: 1 } }]) {
    await assert.rejects(createProductPageReviewSettingsClient(async () => Response.json(body)).get(), (error: unknown) => error instanceof ProductPageReviewSettingsApiError && error.code === "unavailable");
  }
  await assert.rejects(createProductPageReviewSettingsClient(async () => Response.json({ code: "version_conflict" }, { status: 409 })).save({ expectedVersion: 0, enabled: true }, OP), (error: unknown) => error instanceof ProductPageReviewSettingsApiError && error.code === "version_conflict" && error.status === 409);
  let fetches = 0; const client = createProductPageReviewSettingsClient(async () => { fetches++; return Response.json({}); });
  for (const [command, operation] of [[{ expectedVersion: -1, enabled: true }, OP], [{ expectedVersion: 0, enabled: "true" }, OP], [{ expectedVersion: 0, enabled: true }, "not-an-operation"]] as const) assert.throws(() => client.save(command as any, operation));
  assert.equal(fetches, 0);
});
