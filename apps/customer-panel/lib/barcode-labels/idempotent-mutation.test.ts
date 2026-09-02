import assert from "node:assert/strict";
import test from "node:test";
import { idempotentJsonMutation } from "./idempotent-mutation.ts";

test("an uncertain mutation retries once with the exact same operation key and body", async () => {
  const calls: Array<{ key: string | null; body: string | null }> = [];
  const result = await idempotentJsonMutation(
    "/api/catalog/barcode-print-jobs",
    "POST",
    { outputType: "pdf" },
    {
      operationId: "77777777-7777-4777-8777-777777777777",
      parse(value) {
        if (!(value as { id?: unknown }).id) throw new TypeError();
        return value as { id: string };
      },
      async fetcher(_input, init) {
        calls.push({
          key: new Headers(init?.headers).get("idempotency-key"),
          body: String(init?.body ?? ""),
        });
        if (calls.length === 1) throw new TypeError("response lost");
        return Response.json({ id: "job-1" });
      },
    },
  );
  assert.deepEqual(result, { id: "job-1" });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
});

test("a definitive client rejection is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    idempotentJsonMutation("/mutation", "POST", {}, {
      operationId: "77777777-7777-4777-8777-777777777777",
      async fetcher() {
        calls += 1;
        return Response.json({ code: "invalid_input" }, { status: 400 });
      },
    }),
    /invalid_input/,
  );
  assert.equal(calls, 1);
});

test("malformed success JSON retries with the same key before failing closed", async () => {
  const keys: Array<string | null> = [];
  await assert.rejects(
    idempotentJsonMutation("/mutation", "POST", {}, {
      operationId: "77777777-7777-4777-8777-777777777777",
      parse() {
        throw new TypeError("schema mismatch");
      },
      async fetcher(_input, init) {
        keys.push(new Headers(init?.headers).get("idempotency-key"));
        return Response.json({ unexpected: true });
      },
    }),
    /unavailable/,
  );
  assert.deepEqual(keys, [
    "77777777-7777-4777-8777-777777777777",
    "77777777-7777-4777-8777-777777777777",
  ]);
});
