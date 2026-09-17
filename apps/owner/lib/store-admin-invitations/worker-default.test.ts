import assert from "node:assert/strict";
import test from "node:test";
import { createInvitationWorkerStarter } from "./worker-default.ts";
test("worker is a disabled no-op without allocation and enabled singleton drains before close", async () => {
  let initializes = 0, runs = 0, closes = 0, finish!: () => void;
  const current = new Promise<void>(resolve => { finish = resolve; });
  const start = createInvitationWorkerStarter({ source: {}, async initialize() { initializes++; throw Error("forbidden"); } });
  await (await start()).stop(); assert.equal(initializes, 0);
  const enabled = createInvitationWorkerStarter({ source: { CELEBIX_ADMIN_INVITATIONS_WORKER_ENABLED: "true" }, async initialize() { initializes++; return { async runOnce() { runs++; await current; }, async close() { closes++; } }; } });
  const first = await enabled(), second = await enabled(); assert.equal(first, second); assert.equal(initializes, 1); assert.equal(runs, 1);
  const stop = first.stop(); assert.equal(closes, 0); finish(); await stop; assert.equal(closes, 1); assert.equal(runs, 1);
});
test("invitation initialization and tick failures stay isolated and retries are delayed", async () => {
  const failed = createInvitationWorkerStarter({ source: { CELEBIX_ADMIN_INVITATIONS_WORKER_ENABLED: "true" }, async initialize() { throw Error("isolated"); } });
  await (await failed()).stop();
  let runs = 0, closes = 0;
  const enabled = createInvitationWorkerStarter({ source: { CELEBIX_ADMIN_INVITATIONS_WORKER_ENABLED: "true" }, intervalMs: 1000, async initialize() { return { async runOnce() { runs++; throw Error("tick failure"); }, async close() { closes++; } }; } });
  const worker = await enabled(); assert.equal(runs, 1);
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(runs, 1);
  await worker.stop(); assert.equal(closes, 1);
});
