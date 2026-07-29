import assert from "node:assert/strict";
import test from "node:test";

import type { CheckoutStatus } from "@celebix/saas-contracts";
import {
  PublicCheckoutRepositoryError,
  type PublicCheckoutRepository,
} from "@celebix/saas-data";

import { resolveCheckoutResult } from "./result-state.ts";

const HOSTNAME = "shop.example.test";
const CART_CREDENTIAL = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const NOW = new Date("2026-07-29T12:00:00.000Z");

function repository(
  getStatus: PublicCheckoutRepository["getStatus"],
): Pick<PublicCheckoutRepository, "getStatus"> {
  return Object.freeze({ getStatus });
}

test("result status is read only from exact host and cart credential authority", async () => {
  const expected: CheckoutStatus = Object.freeze({
    kind: "paid",
    orderNumber: "SF-2026-000001",
  });
  const calls: unknown[] = [];
  const selected = await resolveCheckoutResult({
    hostname: HOSTNAME,
    cookieHeader: `unrelated=value; __Host-celebix_cart=${CART_CREDENTIAL}`,
    now: NOW,
    repository: repository(async (input) => {
      calls.push(input);
      return expected;
    }),
  });

  assert.deepEqual(selected, { kind: "resolved", status: expected });
  assert.equal(calls.length, 1);
  const input = calls[0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(input).sort(), ["credentialDigest", "hostname", "now"]);
  assert.equal(input.hostname, HOSTNAME);
  assert.match(String(input.credentialDigest), /^[a-f0-9]{64}$/);
  assert.equal(input.now instanceof Date, true);
  assert.equal((input.now as Date).toISOString(), NOW.toISOString());
  assert.equal(JSON.stringify(selected).includes(CART_CREDENTIAL), false);
});

test("missing or malformed cart credentials never reach status authority", async () => {
  for (const cookieHeader of [
    null,
    "",
    "__Host-celebix_cart=short",
    "__Host-celebix_cart=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; __Host-celebix_cart=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  ]) {
    let calls = 0;
    const selected = await resolveCheckoutResult({
      hostname: HOSTNAME,
      cookieHeader,
      now: NOW,
      repository: repository(async () => {
        calls += 1;
        return Object.freeze({ kind: "ready" });
      }),
    });
    assert.deepEqual(selected, { kind: "not_found" }, String(cookieHeader));
    assert.equal(calls, 0, String(cookieHeader));
  }
});

test("result status maps missing carts and seals repository failures", async () => {
  for (const [error, expected] of [
    [new PublicCheckoutRepositoryError("not_found"), { kind: "not_found" }],
    [new Error("postgres://private@database/order"), { kind: "unavailable" }],
  ] as const) {
    const selected = await resolveCheckoutResult({
      hostname: HOSTNAME,
      cookieHeader: `__Host-celebix_cart=${CART_CREDENTIAL}`,
      now: NOW,
      repository: repository(async () => { throw error; }),
    });
    assert.deepEqual(selected, expected);
    assert.doesNotMatch(JSON.stringify(selected), /postgres|private|database|order/i);
  }
});

test("malformed repository status is unavailable and cannot invent paid state", async () => {
  const selected = await resolveCheckoutResult({
    hostname: HOSTNAME,
    cookieHeader: `__Host-celebix_cart=${CART_CREDENTIAL}`,
    now: NOW,
    repository: repository(async () => ({
      kind: "paid",
      orderNumber: "SF-2026-000001",
      providerBody: "private",
    }) as never),
  });
  assert.deepEqual(selected, { kind: "unavailable" });
});
