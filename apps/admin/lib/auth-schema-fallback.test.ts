import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthSchemaUnavailableError,
  resolveAuthSchemaFallback,
} from "./auth-schema-fallback.ts";

const missingTable = Object.assign(new Error("relation does not exist"), {
  code: "42P01",
});
const isMissingSchemaError = (error: unknown) =>
  typeof error === "object" && error !== null && Reflect.get(error, "code") === "42P01";

test("legacy authorization remains available while a new schema is being introduced", async () => {
  const result = await resolveAuthSchemaFallback({
    readPrimary: async () => null,
    readLegacy: async () => ({ userId: "legacy-user" }),
    isMissingSchemaError,
  });

  assert.deepEqual(result, { userId: "legacy-user" });
});

test("a missing new schema can fall back to a healthy legacy schema", async () => {
  const result = await resolveAuthSchemaFallback({
    readPrimary: async () => {
      throw missingTable;
    },
    readLegacy: async () => ({ userId: "legacy-user" }),
    isMissingSchemaError,
  });

  assert.deepEqual(result, { userId: "legacy-user" });
});

test("missing primary and legacy schemas surface an infrastructure failure", async () => {
  await assert.rejects(
    resolveAuthSchemaFallback({
      readPrimary: async () => {
        throw missingTable;
      },
      readLegacy: async () => {
        throw missingTable;
      },
      isMissingSchemaError,
    }),
    AuthSchemaUnavailableError,
  );
});

test("a real primary database outage is never hidden by legacy fallback", async () => {
  const outage = new Error("connection refused");

  await assert.rejects(
    resolveAuthSchemaFallback({
      readPrimary: async () => {
        throw outage;
      },
      readLegacy: async () => ({ userId: "legacy-user" }),
      isMissingSchemaError,
    }),
    outage,
  );
});

test("a healthy primary schema with no membership remains a normal denial", async () => {
  const result = await resolveAuthSchemaFallback({
    readPrimary: async () => null,
    readLegacy: async () => {
      throw missingTable;
    },
    isMissingSchemaError,
  });

  assert.equal(result, null);
});
