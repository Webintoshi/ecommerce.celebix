import assert from "node:assert/strict";
import test from "node:test";

import { createActiveVisitorPoller } from "./active-visitors.ts";

const NOW = new Date("2026-09-04T12:00:00.000Z");

test("active visitor polling uses thirty seconds, pauses hidden and resumes immediately", async () => {
  let visible = true;
  let timer: (() => void) | undefined;
  let delay = 0;
  let calls = 0;
  const values: unknown[] = [];
  const poller = createActiveVisitorPoller({
    visible: () => visible,
    now: () => NOW,
    load: async () => ({
      schemaVersion: 1 as const,
      status: "ready" as const,
      activeVisitors: calls++,
      asOf: NOW.toISOString(),
    }),
    publish: (value) => values.push(value),
    schedule: (callback, milliseconds) => {
      timer = callback;
      delay = milliseconds;
      return 1;
    },
    cancel: () => {
      timer = undefined;
    },
  });
  poller.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(delay, 30_000);
  visible = false;
  poller.visibilityChanged();
  assert.equal(timer, undefined);
  visible = true;
  poller.visibilityChanged();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
  assert.equal(values.length, 2);
  poller.dispose();
});

test("active visitor failure publishes unavailable instead of zero", async () => {
  const values: Array<{ status: string; activeVisitors: number | null }> = [];
  const poller = createActiveVisitorPoller({
    visible: () => true,
    now: () => NOW,
    load: async () => {
      throw new Error("private provider failure");
    },
    publish: (value) => values.push(value),
    schedule: () => 1,
    cancel: () => undefined,
  });
  poller.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(values[0], {
    schemaVersion: 1,
    status: "unavailable",
    activeVisitors: null,
    asOf: NOW.toISOString(),
  });
  poller.dispose();
});
