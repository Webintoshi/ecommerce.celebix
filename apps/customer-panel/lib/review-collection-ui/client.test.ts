import assert from "node:assert/strict";
import test from "node:test";
import { createReviewCollectionApi, ReviewCollectionApiError } from "./client.ts";
test("settings retain the caller's operation key across network retries", async () => {
  const calls: RequestInit[] = []; let count = 0;
  const api = createReviewCollectionApi(async (_path, init) => { calls.push(init!); return ++count === 1 ? Response.json({ code: "unavailable" }, { status: 503 }) : Response.json({ enabled: true, delayDays: 3, version: 4 }); });
  const draft = { enabled: true, delayDays: 3, version: 3 }, key = "10000000-0000-4000-8000-000000000001";
  await assert.rejects(api.saveSettings(draft, key), ReviewCollectionApiError);
  assert.equal((await api.saveSettings(draft, key)).version, 4); assert.equal(new Headers(calls[0]?.headers).get("idempotency-key"), key); assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(JSON.parse(String(calls[0]?.body)), { enabled: true, delayDays: 3, expectedVersion: 3 });
});
test("manual requests carry selected eligible order version with existing tenant credentials", async () => {
  let path = "", request: RequestInit | undefined;
  const api = createReviewCollectionApi(async (input, init) => { path = String(input); request = init; return Response.json({ queuedCount: 2 }); });
  const result = await api.requestOrder("20000000-0000-4000-8000-000000000001", 7, "30000000-0000-4000-8000-000000000001");
  assert.equal(result.queuedCount, 2); assert.equal(path, "/api/catalog/admin/review-collection/request"); assert.equal(request?.credentials, "same-origin"); assert.equal(request?.cache, "no-store");
  assert.deepEqual(JSON.parse(String(request?.body)), { orderId: "20000000-0000-4000-8000-000000000001", expectedVersion: 7 });
});
