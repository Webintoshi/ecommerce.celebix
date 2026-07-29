import assert from "node:assert/strict";
import test from "node:test";

import { runStorefrontDatabasePreflight } from "./database-preflight.ts";

type QueryResult = Readonly<{ rowCount: number; rows: readonly Record<string, unknown>[] }>;

function validResult(overrides: Record<string, unknown> = {}): QueryResult {
  return {
    rowCount: 1,
    rows: [{
      version_num: 160014,
      database_name: "celebix_saas_staging",
      is_superuser: false,
      role_inherits: false,
      resolver_member: true,
      workflow_member: true,
      resolver_set: true,
      workflow_set: true,
      resolver_usage: false,
      workflow_usage: false,
      migration_020: true,
      migration_027: true,
      migration_028: true,
      migration_032: true,
      migration_039: true,
      migration_064: true,
      ...overrides,
    }],
  };
}

test("preflight assumes the NOINHERIT workflow role inside one transaction", async () => {
  const statements: string[] = [];
  const client = {
    query: async (statement: string) => {
      statements.push(statement);
      return statement.startsWith("SELECT") ? validResult() : { rowCount: 0, rows: [] };
    },
  };

  await runStorefrontDatabasePreflight(client, "celebix_saas_staging", false);

  assert.equal(statements[0], "BEGIN");
  assert.equal(statements[1], "SET LOCAL ROLE celebix_saas_workflow");
  assert.match(statements[2]!, /role\.rolname=session_user/);
  assert.match(statements[2]!, /pg_has_role\(session_user,'celebix_saas_workflow','MEMBER'\)/);
  assert.match(statements[2]!, /pg_has_role\(session_user,'celebix_saas_host_resolver','SET'\)/);
  assert.match(statements[2]!, /pg_has_role\(session_user,'celebix_saas_workflow','SET'\)/);
  assert.match(statements[2]!, /pg_has_role\(session_user,'celebix_saas_host_resolver','USAGE'\)/);
  assert.equal(statements[3], "COMMIT");
});

test("preflight rejects ambient inheritance and membership without SET authority", async () => {
  for (const override of [
    { role_inherits: true },
    { resolver_set: false },
    { workflow_set: false },
    { resolver_usage: true },
    { workflow_usage: true },
  ]) {
    const client = {
      query: async (statement: string) => statement.startsWith("SELECT")
        ? validResult(override)
        : { rowCount: 0, rows: [] },
    };
    await assert.rejects(
      runStorefrontDatabasePreflight(client, "celebix_saas_staging", false),
      /storefront_database_preflight_failed/,
    );
  }
});

test("preflight rolls back and fails closed when an invariant is false", async () => {
  const statements: string[] = [];
  const client = {
    query: async (statement: string) => {
      statements.push(statement);
      return statement.startsWith("SELECT")
        ? validResult({ migration_064: false })
        : { rowCount: 0, rows: [] };
    },
  };

  await assert.rejects(
    runStorefrontDatabasePreflight(client, "celebix_saas_staging", false),
    /storefront_database_preflight_failed/,
  );
  assert.equal(statements.at(-1), "ROLLBACK");
});

test("analytics migration is required only when the collector is configured", async () => {
  const makeClient = () => ({
    query: async (statement: string) => statement.startsWith("SELECT")
      ? validResult({ migration_039: false })
      : { rowCount: 0, rows: [] },
  });

  await runStorefrontDatabasePreflight(makeClient(), "celebix_saas_staging", false);
  await assert.rejects(
    runStorefrontDatabasePreflight(makeClient(), "celebix_saas_staging", true),
    /storefront_database_preflight_failed/,
  );
});
