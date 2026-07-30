import assert from "node:assert/strict";
import test from "node:test";

import { resolveStoreAdminAssignmentMode } from "./store-admin-assignment.ts";

test("routes light Postgres with Logto to the subject-bound assignment path", () => {
  assert.equal(
    resolveStoreAdminAssignmentMode({
      databaseMode: "light_postgres",
      authProvider: "logto",
    }),
    "logto_light_postgres",
  );
});

test("keeps full Supabase stores on the legacy assignment path", () => {
  assert.equal(
    resolveStoreAdminAssignmentMode({
      databaseMode: "full_supabase",
      authProvider: "supabase",
    }),
    "supabase_legacy",
  );
});

test("rejects mixed architectures instead of silently falling back", () => {
  assert.throws(
    () =>
      resolveStoreAdminAssignmentMode({
        databaseMode: "light_postgres",
        authProvider: "supabase",
      }),
    /desteklenmeyen/i,
  );
  assert.throws(
    () =>
      resolveStoreAdminAssignmentMode({
        databaseMode: "full_supabase",
        authProvider: "logto",
      }),
    /desteklenmeyen/i,
  );
});
