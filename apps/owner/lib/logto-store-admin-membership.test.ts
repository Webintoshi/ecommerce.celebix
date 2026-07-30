import assert from "node:assert/strict";
import test from "node:test";

import { persistLogtoStoreAdminMembership } from "./logto-store-admin-membership.ts";

type QueryCall = { sql: string; params: unknown[] };

function createRecorder(failAt?: number) {
  const calls: QueryCall[] = [];
  const query = async <TRow extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<TRow[]> => {
    calls.push({ sql, params });
    if (calls.length === failAt) {
      throw new Error("sql failed");
    }
    if (calls.length === 1) {
      return [{ principal_id: "principal-1" }] as TRow[];
    }
    return [];
  };
  return { calls, query };
}

const assignment = {
  subject: "logto-user-1",
  email: "manager@example.com",
  fullName: "Store Manager",
  storeSlug: "hemenaku",
  role: "product_manager" as const,
  taskDefinition: "Urun katalogunu yonetir",
};

test("upserts the principal and exactly one active store role without password data", async () => {
  const recorder = createRecorder();

  const result = await persistLogtoStoreAdminMembership({
    query: recorder.query,
    ...assignment,
  });

  assert.deepEqual(result, { principalId: "principal-1" });
  assert.equal(recorder.calls.length, 3);

  const [principal, deactivate, membership] = recorder.calls;
  assert.match(principal.sql, /insert into public\.auth_principals/i);
  assert.match(principal.sql, /on conflict \(provider, subject\)/i);
  assert.match(principal.sql, /status\s*=\s*'active'/i);
  assert.deepEqual(principal.params, [
    assignment.subject,
    assignment.email,
    assignment.fullName,
  ]);
  assert.doesNotMatch(JSON.stringify(recorder.calls), /password/i);

  assert.match(deactivate.sql, /update public\.auth_store_memberships/i);
  assert.match(deactivate.sql, /status\s*=\s*'inactive'/i);
  assert.deepEqual(deactivate.params, [
    "principal-1",
    assignment.storeSlug,
    assignment.role,
  ]);

  assert.match(membership.sql, /insert into public\.auth_store_memberships/i);
  assert.match(membership.sql, /on conflict \(principal_id, store_slug, role\)/i);
  assert.match(membership.sql, /status\s*=\s*'active'/i);
  assert.deepEqual(membership.params, [
    "principal-1",
    assignment.storeSlug,
    assignment.role,
    assignment.taskDefinition,
  ]);
  assert.doesNotMatch(principal.sql, /taskDefinition|task_definition/i);
});

test("stops immediately when a SQL statement fails", async () => {
  const recorder = createRecorder(2);

  await assert.rejects(
    persistLogtoStoreAdminMembership({ query: recorder.query, ...assignment }),
    /sql failed/,
  );

  assert.equal(recorder.calls.length, 2);
});

test("repeating the assignment uses idempotent conflict targets", async () => {
  const first = createRecorder();
  const second = createRecorder();

  await persistLogtoStoreAdminMembership({ query: first.query, ...assignment });
  await persistLogtoStoreAdminMembership({ query: second.query, ...assignment });

  assert.deepEqual(
    first.calls.map(({ sql, params }) => [sql.replace(/\s+/g, " ").trim(), params]),
    second.calls.map(({ sql, params }) => [sql.replace(/\s+/g, " ").trim(), params]),
  );
});
