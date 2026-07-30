import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminCallback } from "./admin-callback-flow.ts";

type Tokens = { accessToken: string };
type Identity = { sub?: string };
type Membership = { userId: string };

const TOKENS: Tokens = { accessToken: "test-access-token" };
const IDENTITY: Identity = { sub: "logto-subject-1" };
const MEMBERSHIP: Membership = { userId: "principal-1" };

function successfulInput() {
  return {
    exchangeCode: async () => TOKENS,
    fetchIdentity: async (_tokens: Tokens) => IDENTITY,
    readSubject: (identity: Identity) => identity.sub ?? null,
    findMembership: async (_subject: string) => MEMBERSHIP,
  };
}

test("a valid callback returns the exchanged identity and assigned membership", async () => {
  const result = await resolveAdminCallback(successfulInput());

  assert.deepEqual(result, {
    ok: true,
    tokens: TOKENS,
    identity: IDENTITY,
    membership: MEMBERSHIP,
  });
});

test("a code exchange failure is classified without exposing the exception", async () => {
  const result = await resolveAdminCallback({
    ...successfulInput(),
    exchangeCode: async () => {
      throw new Error("upstream body contains a secret");
    },
  });

  assert.deepEqual(result, { ok: false, error: "token_exchange_failed" });
});

test("userinfo failure and missing subjects are identity lookup failures", async () => {
  const lookupFailure = await resolveAdminCallback({
    ...successfulInput(),
    fetchIdentity: async () => {
      throw new Error("userinfo unavailable");
    },
  });
  const missingSubject = await resolveAdminCallback({
    ...successfulInput(),
    fetchIdentity: async () => ({}),
  });

  assert.deepEqual(lookupFailure, { ok: false, error: "identity_lookup_failed" });
  assert.deepEqual(missingSubject, { ok: false, error: "identity_lookup_failed" });
});

test("a membership infrastructure failure is not mistaken for missing access", async () => {
  const result = await resolveAdminCallback({
    ...successfulInput(),
    findMembership: async () => {
      throw new Error("database connection refused");
    },
  });

  assert.deepEqual(result, { ok: false, error: "membership_unavailable" });
});

test("an authenticated identity without a store membership is denied", async () => {
  const result = await resolveAdminCallback({
    ...successfulInput(),
    findMembership: async () => null,
  });

  assert.deepEqual(result, { ok: false, error: "not_assigned" });
});
