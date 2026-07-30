import assert from "node:assert/strict";
import test from "node:test";

import { createAdminCallbackDeduplicator } from "./admin-callback-once.ts";

test("duplicate callback states share one in-flight authentication", async () => {
  const runOnce = createAdminCallbackDeduplicator();
  let resolveTask: ((value: string) => void) | undefined;
  let calls = 0;
  const task = () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      resolveTask = resolve;
    });
  };

  const first = runOnce("signed-state", task);
  const duplicate = runOnce("signed-state", task);

  assert.equal(calls, 1);
  resolveTask?.("authenticated");
  assert.deepEqual(await Promise.all([first, duplicate]), [
    "authenticated",
    "authenticated",
  ]);
});

test("a completed callback is reused briefly and expires deterministically", async () => {
  let now = 1_000;
  const runOnce = createAdminCallbackDeduplicator({
    ttlMs: 500,
    now: () => now,
  });
  let calls = 0;
  const task = async () => ++calls;

  assert.equal(await runOnce("state", task), 1);
  assert.equal(await runOnce("state", task), 1);
  assert.equal(calls, 1);

  now += 501;
  assert.equal(await runOnce("state", task), 2);
  assert.equal(calls, 2);
});

test("different signed states never share callback results", async () => {
  const runOnce = createAdminCallbackDeduplicator();
  let calls = 0;

  assert.deepEqual(
    await Promise.all([
      runOnce("state-a", async () => ++calls),
      runOnce("state-b", async () => ++calls),
    ]),
    [1, 2],
  );
});
