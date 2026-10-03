import assert from "node:assert/strict";
import { test } from "node:test";

const module = await import("./runtime.ts").catch(() => null);
const createTick = module?.createCustomerEngagementTick;
test("notification lifecycle runs stock job even if review job fails", async () => {
  assert.equal(typeof createTick, "function");
  let stock = 0;
  const tick = createTick!({ reviews: async () => { throw Error("private failure"); }, restock: async () => { stock++; return { claimed: 1, accepted: 1, retried: 0, failed: 0, skipped: 0, recordingErrors: 0 }; } });
  assert.deepEqual(await tick(), { reviews: "failed", restock: { claimed: 1, accepted: 1, retried: 0, failed: 0, skipped: 0, recordingErrors: 0 } });
  assert.equal(stock, 1);
});
test("notification lifecycle preserves review result if stock repository is unavailable", async () => {
  assert.equal(typeof createTick, "function");
  const tick = createTick!({ reviews: async () => "processed" as const, restock: async () => { throw Error("private DB failure"); } });
  assert.deepEqual(await tick(), { reviews: "processed", restock: null });
});
