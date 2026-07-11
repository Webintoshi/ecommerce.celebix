import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult } from "pg";

import { createPostgresSaaSDataRepositoryForTesting } from "../testing/index.ts";
import { SaaSDataPersistenceError, SaaSDataUnknownCommitError } from "./errors.ts";
import type { PostgresClientLike } from "./repository.ts";

function empty(): QueryResult<Record<string, unknown>> { return { command: "", rowCount: 0, oid: 0, fields: [], rows: [] }; }
class Client implements PostgresClientLike {
  calls: string[] = []; releases: Array<boolean | Error | undefined> = [];
  async query(text: string) { this.calls.push(text); return empty(); }
  release(value?: boolean | Error) { this.releases.push(value); }
}
function options(client: Client) {
  return { pool: { connect: async () => client }, generateId: () => "90000000-0000-4000-8000-000000000001", audit: () => undefined, timeouts: { statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 8_000 }, bootstrapRole: "celebix_saas_bootstrap" as const };
}

test("before_commit fault remains rollback-safe and does not forward COMMIT", async () => {
  const client = new Client();
  const transaction = await createPostgresSaaSDataRepositoryForTesting(options(client), { failAt: "before_commit" }).beginTransaction();
  await assert.rejects(transaction.commit(), SaaSDataPersistenceError);
  assert.equal(client.calls.includes("COMMIT"), false);
  await transaction.rollback();
  assert.deepEqual(client.releases, [undefined]);
});

test("blocked and forwarded COMMIT failures are unknown outcomes and destroy the client", async () => {
  for (const failAt of ["commit_blocked_before_forwarding", "commit_forwarded_then_connection_failure"] as const) {
    const client = new Client();
    const transaction = await createPostgresSaaSDataRepositoryForTesting(options(client), { failAt }).beginTransaction();
    await assert.rejects(transaction.commit(), SaaSDataUnknownCommitError);
    assert.equal(client.calls.includes("COMMIT"), failAt === "commit_forwarded_then_connection_failure");
    assert.deepEqual(client.releases, [true]);
  }
});
