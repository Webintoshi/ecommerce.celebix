import assert from "node:assert/strict";
import test from "node:test";
import { commandAttempt, CommandFailure, moneyToCents, nonnegativeInteger, submitCommand } from "./command.ts";

test("TRY input preserves exact cents and rejects rounded or unsafe amounts", () => {
  assert.equal(moneyToCents("1250,50"), 125050);
  assert.equal(moneyToCents("0.01"), 1);
  assert.equal(moneyToCents("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  for (const input of ["0", "-1", "1.005", "1e3", "1,000.00", "90071992547409.92", ""]) assert.throws(() => moneyToCents(input));
  assert.equal(nonnegativeInteger("0"), 0);
  assert.throws(() => nonnegativeInteger("1.5"));
});

test("same payload/version reuses key; edited payload or refreshed version gets a new key", () => {
  let generated = 0;
  const key = () => `key-${++generated}`;
  const first = commandAttempt(null, "billing.receipt.record", { amountCents: 1000 }, 2, key);
  assert.equal(commandAttempt(first, "billing.receipt.record", { amountCents: 1000 }, 2, key), first);
  assert.notEqual(commandAttempt(first, "billing.receipt.record", { amountCents: 1100 }, 2, key).key, first.key);
  assert.notEqual(commandAttempt(first, "billing.receipt.record", { amountCents: 1000 }, 3, key).key, first.key);
});

test("missing command response is uncertain and server business failures remain readable", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { throw new Error("network failed"); };
  await assert.rejects(() => submitCommand("/api/platform/billing", "billing.receipt.record", {}, 1, "same-key"), error => error instanceof CommandFailure && error.uncertain);
  globalThis.fetch = async () => Response.json({ error: "Tutar kalan alacağı aşıyor." }, { status: 422 });
  await assert.rejects(() => submitCommand("/api/platform/billing", "billing.receipt.record", {}, 1, "same-key"), error => error instanceof CommandFailure && !error.uncertain && error.message === "Tutar kalan alacağı aşıyor.");
  globalThis.fetch = async () => Response.json({ outcome: "committed", version: 2 });
  await assert.rejects(() => submitCommand("/api/platform/billing", "billing.receipt.record", {}, 1, "same-key"), error => error instanceof CommandFailure && error.uncertain);
});
