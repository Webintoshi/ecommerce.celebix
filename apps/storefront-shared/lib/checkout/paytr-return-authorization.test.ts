import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { createPaytrReturnAuthorization, createStorefrontProxy } from "../../proxy.ts";
import { digestRedemptionCredential } from "./redemption-cookie.ts";

const hostname = "pilot.saas-staging.celebix.site";

test("PayTR return remains usable after callback removes the owned payment presentation", async () => {
  let returnReads = 0;
  let presentationReads = 0;
  const proxy = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname }),
    resolveMediaOrigin: () => "https://media.celebix.net",
    authorizePaytrIframe: async () => { presentationReads++; return false; },
    // The status repository authenticates the current source/session even
    // after captured/failed callbacks have removed its iframe presentation.
    authorizePaytrReturn: async ({ hostname: host, cookieHeader }) => {
      returnReads++;
      return host === hostname && cookieHeader === "owned=terminal";
    },
    now: () => new Date("2026-10-02T12:00:00Z"),
  } as Parameters<typeof createStorefrontProxy>[0]);
  const response = await proxy(new NextRequest(`https://${hostname}/odeme/hizli/sonuc?durum=basarili`, {
    headers: { cookie: "owned=terminal" },
  }));
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'self' https:\/\/www\.paytr\.com/);
  assert.equal(response.headers.get("x-frame-options"), null);
  assert.equal(returnReads, 1);
  assert.equal(presentationReads, 0);
  // Return authority cannot open the payment document or near-match URLs.
  for (const path of ["/odeme/hizli/odeme", "/odeme/hizli/sonuc?durum=basarili&x=1", "/products/test"]) {
    const denied = await proxy(new NextRequest(`https://${hostname}${path}`, { headers: { cookie: "owned=terminal" } }));
    assert.equal(denied.headers.get("x-frame-options"), "DENY");
    assert.doesNotMatch(denied.headers.get("content-security-policy") ?? "", /frame-ancestors 'self' https:\/\/www\.paytr\.com/);
  }
  assert.equal(returnReads, 1);
});

test("return authority rejects failed ownership lookup and non-GET requests", async () => {
  let reads = 0;
  const proxy = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname }),
    resolveMediaOrigin: () => "https://media.celebix.net",
    authorizePaytrIframe: async () => false,
    authorizePaytrReturn: async () => { reads++; throw new Error("not_owned"); },
    now: () => new Date("2026-10-02T12:00:00Z"),
  } as Parameters<typeof createStorefrontProxy>[0]);
  const target = `https://${hostname}/odeme/hizli/sonuc?durum=basarisiz`;
  for (const method of ["GET", "POST"]) {
    const response = await proxy(new NextRequest(target, { method, headers: { cookie: "wrong=terminal" } }));
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  }
  assert.equal(reads, 1);
});

test("production return authorization uses terminal status with the original host and cookie", async () => {
  let state = "captured";
  const authorize = createPaytrReturnAuthorization(async () => ({
    hostedCheckout: { async status(input) {
      if (input.hostname !== hostname || input.cookieHeader !== "owned=terminal") throw new Error("not_owned");
      return { status: state };
    } },
    checkout: { quickOrderRepository: { async getStatus() { throw new Error("unused"); } } },
  }));
  const input = { hostname, cookieHeader: "owned=terminal", now: new Date("2026-10-02T12:00:00Z") };
  for (state of ["captured", "failed", "processing"]) assert.equal(await authorize(input), true);
  state = "active";
  assert.equal(await authorize(input), false);
  assert.equal(await authorize({ ...input, hostname: "other.celebix.site" }), false);
  assert.equal(await authorize({ ...input, cookieHeader: "wrong=session" }), false);
  assert.equal(await authorize({ ...input, cookieHeader: null }), false);
  assert.equal(await authorize({ ...input, now: new Date(NaN) }), false);
});

test("production return authorization falls back only to an authenticated completed quick checkout", async () => {
  const credential = `q1.${Buffer.alloc(32, 7).toString("base64url")}`;
  const now = new Date("2026-10-02T12:00:00Z");
  let kind = "paid";
  let reads = 0;
  const authorize = createPaytrReturnAuthorization(async () => ({
    hostedCheckout: { async status() { throw new Error("no_standard_session"); } },
    checkout: { quickOrderRepository: { async getStatus(input) {
      reads++;
      if (input.hostname !== hostname || input.redemptionDigest !== digestRedemptionCredential(credential)) throw new Error("not_owned");
      assert.equal(input.now.getTime(), now.getTime());
      return { kind };
    } } },
  }));
  const input = { hostname, cookieHeader: `__Host-celebix_quick=${credential}`, now };
  for (kind of ["paid", "processing", "failed"]) assert.equal(await authorize(input), true);
  for (kind of ["ready", "unavailable"]) assert.equal(await authorize(input), false);
  assert.equal(await authorize({ ...input, hostname: "other.celebix.site" }), false);
  const before = reads;
  assert.equal(await authorize({ ...input, cookieHeader: "__Host-celebix_quick=invalid" }), false);
  assert.equal(reads, before);
});
