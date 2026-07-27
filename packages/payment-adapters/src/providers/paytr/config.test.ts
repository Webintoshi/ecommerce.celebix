import assert from "node:assert/strict";
import test from "node:test";

import {
  createPaytrIframeStatusToken,
  createPaytrIframeToken,
  parsePaytrIframeCredential,
  verifyPaytrIframeCallbackHash,
} from "./config.ts";

const credential = {
  merchantId: "123456",
  merchantKey: "test-merchant-key",
  merchantSalt: "test-merchant-salt",
};
const merchantOid = "abc123def456abc123def456abc123de";
const userBasket = "W1siw5ZybmVrIMO8csO8biIsIjE4LjAwIiwyXV0=";

test("matches the canonical PayTR iframe, callback, and status HMAC vectors", () => {
  assert.equal(createPaytrIframeToken({
    credential,
    userIp: "8.8.8.8",
    merchantOid,
    email: "ada@example.com",
    paymentAmount: 3_600,
    userBasket,
    noInstallment: 0,
    maxInstallment: 0,
    currency: "TL",
    testMode: 1,
  }), "GgNqUVAdw+xF+ISBw/2efKnwdab+iYhaXb/NMUCXz8U=");
  assert.equal(
    createPaytrIframeStatusToken(credential, merchantOid),
    "5QldwMdWkWyumPa40DcWsT8JluSOLN9L59Nplx9owlo=",
  );
  assert.equal(verifyPaytrIframeCallbackHash({
    credential,
    merchantOid,
    status: "success",
    totalAmount: "3600",
    providedHash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
  }), true);
  assert.equal(verifyPaytrIframeCallbackHash({
    credential,
    merchantOid,
    status: "success",
    totalAmount: "3600",
    providedHash: "ArJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
  }), false);
});

test("returns an exact writable credential structure and rejects hostile authority", () => {
  const parsed = parsePaytrIframeCredential(credential);
  assert.deepEqual(parsed, credential);
  assert.equal(Object.isFrozen(parsed), false);
  parsed.merchantKey = "";
  parsed.merchantSalt = "";
  assert.deepEqual(parsed, {
    merchantId: "123456",
    merchantKey: "",
    merchantSalt: "",
  });

  for (const value of [
    { ...credential, callbackUrl: "https://attacker.example" },
    { ...credential, merchantKey: "" },
    Object.create(credential),
    new Proxy({ ...credential }, {}),
  ]) {
    assert.throws(
      () => parsePaytrIframeCredential(value),
      /paytr_credential_invalid/,
    );
  }

  const accessor = { ...credential };
  Object.defineProperty(accessor, "merchantKey", {
    enumerable: true,
    get() { throw new Error("secret accessor must not run"); },
  });
  assert.throws(
    () => parsePaytrIframeCredential(accessor),
    /paytr_credential_invalid/,
  );

  for (const merchantKey of [
    "ş".repeat(129),
    `safe\u0085key`,
    `safe\uD800key`,
  ]) {
    assert.throws(
      () => parsePaytrIframeCredential({ ...credential, merchantKey }),
      /paytr_credential_invalid/,
    );
  }
});

test("rejects noncanonical callback amounts before comparison", () => {
  for (const totalAmount of ["03600", "+3600", "3600 ", "36.00", "1e3"]) {
    assert.equal(verifyPaytrIframeCallbackHash({
      credential,
      merchantOid,
      status: "success",
      totalAmount,
      providedHash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
    }), false);
  }
});
