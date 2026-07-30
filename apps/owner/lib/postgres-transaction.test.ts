import assert from "node:assert/strict";
import test from "node:test";

import { runPostgresTransaction } from "./postgres-transaction.ts";

class FakeClient {
  statements: string[] = [];

  async query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }> {
    this.statements.push(sql);
    return { rows: [] };
  }
}

test("commits only after the transaction callback succeeds", async () => {
  const client = new FakeClient();

  const result = await runPostgresTransaction(client, async ({ query }) => {
    await query("SELECT 1");
    return "completed";
  });

  assert.equal(result, "completed");
  assert.deepEqual(client.statements, ["BEGIN", "SELECT 1", "COMMIT"]);
});

test("rolls back and preserves the original callback error", async () => {
  const client = new FakeClient();
  const failure = new Error("membership insert failed");

  await assert.rejects(
    runPostgresTransaction(client, async ({ query }) => {
      await query("SELECT 1");
      throw failure;
    }),
    (error: unknown) => error === failure,
  );

  assert.deepEqual(client.statements, ["BEGIN", "SELECT 1", "ROLLBACK"]);
});
