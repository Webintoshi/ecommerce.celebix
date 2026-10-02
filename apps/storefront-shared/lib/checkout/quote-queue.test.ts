import assert from "node:assert/strict";
import test from "node:test";

const modulePromise = import("./quote-queue.ts").catch(() => null);

test("checkout quotes finish in order so an older response cannot overwrite the coupon cookie", async () => {
  const module = await modulePromise;
  assert.ok(module, "checkout quote queue exists");
  const started: string[] = [];
  let finishFirst: (() => void) | undefined;
  const queue = module.createCheckoutQuoteQueue(async (_intent, codes) => {
    started.push(codes.join("."));
    if (codes[0] === "FIRST") await new Promise<void>(resolve => { finishFirst = resolve; });
    return codes.join(".");
  });
  const first = queue("cart", ["FIRST"]);
  const second = queue("buy_now", ["SECOND"]);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(started, ["FIRST"]);
  finishFirst?.();
  assert.equal(await first, "FIRST");
  assert.equal(await second, "SECOND");
  assert.deepEqual(started, ["FIRST", "SECOND"]);
});

test("one unavailable quote does not block the next code removal or retry", async () => {
  const module = await modulePromise;
  assert.ok(module, "checkout quote queue exists");
  const queue = module.createCheckoutQuoteQueue(async (_intent, codes) => {
    if (codes.length) throw new Error("unavailable");
    return "refreshed";
  });
  await assert.rejects(queue("cart", ["CODE"]), /unavailable/u);
  assert.equal(await queue("cart", []), "refreshed");
});
