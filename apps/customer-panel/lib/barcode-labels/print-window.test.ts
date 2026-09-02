import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelPrintWindow,
  completePrintWindow,
  reservePrintWindow,
} from "./print-window.ts";

test("browser print window is reserved before the first network await", async () => {
  const order: string[] = [];
  let unblock!: () => void;
  const pending = new Promise<void>((resolve) => { unblock = resolve; });
  const fake = {
    opener: {} as unknown,
    location: { replace(url: string) { order.push(`navigate:${url}`); } },
    close() { order.push("close"); },
  } as unknown as Window;
  const flow = (async () => {
    const reserved = reservePrintWindow(() => {
      order.push("reserve");
      return fake;
    });
    await pending;
    order.push("response");
    completePrintWindow(reserved, "/products/barcode-labels/print?jobId=job");
  })();
  assert.deepEqual(order, ["reserve"]);
  assert.equal(fake.opener, null);
  unblock();
  await flow;
  assert.deepEqual(order, [
    "reserve",
    "response",
    "navigate:/products/barcode-labels/print?jobId=job",
  ]);
});

test("failed preparation closes a reserved blank window", () => {
  let closed = false;
  cancelPrintWindow({ close() { closed = true; } } as Window);
  assert.equal(closed, true);
});
