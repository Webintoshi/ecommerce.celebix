import assert from "node:assert/strict";
import test from "node:test";

import {
  createPaytrIframeCallbackHash as createPaytrIframeCallbackHashFromPackage,
} from "../../index.ts";
import {
  createPaytrIframeCallbackHash as createPaytrIframeCallbackHashFromAdapter,
} from "./adapter.ts";
import {
  createPaytrIframeCallbackHash,
  createPaytrIframeStatusToken,
  createPaytrIframeToken,
  parsePaytrIframeCredential,
  verifyPaytrIframeCallbackHash,
  wipePaytrCredential,
} from "./config.ts";

const credential = {
  merchantId: "123456",
  merchantKey: "test-merchant-key",
  merchantSalt: "test-merchant-salt",
};
const merchantOid = "abc123def456abc123def456abc123de";
const userBasket = "W1siw5ZybmVrIMO8csO8biIsIjE4LjAwIiwyXV0=";

type CapturedEncoding = Readonly<{
  source: string;
  bytes: Uint8Array;
}>;

function captureSecretEncodings(
  captured: CapturedEncoding[],
  operation: () => void,
  secrets: ReadonlySet<string> = new Set([
    credential.merchantKey,
    credential.merchantSalt,
  ]),
): void {
  const descriptor = Object.getOwnPropertyDescriptor(TextEncoder.prototype, "encode");
  assert.ok(descriptor !== undefined && typeof descriptor.value === "function");
  const original = descriptor.value as TextEncoder["encode"];
  Object.defineProperty(TextEncoder.prototype, "encode", {
    ...descriptor,
    value(this: TextEncoder, source = "") {
      const bytes = Reflect.apply(original, this, [source]) as Uint8Array;
      if (secrets.has(source)) {
        assert.equal(bytes.some((byte) => byte !== 0), true);
        captured.push(Object.freeze({ source, bytes }));
      }
      return bytes;
    },
  });
  try {
    operation();
  } finally {
    Object.defineProperty(TextEncoder.prototype, "encode", descriptor);
  }
}

function assertExactSecretEncodingsAreZero(captured: CapturedEncoding[]): void {
  assert.equal(captured.every(({ bytes }) => bytes.every((byte) => byte === 0)), true);
  assert.deepEqual(captured.map(({ source }) => source), [
    credential.merchantKey,
    credential.merchantSalt,
  ]);
}

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

test("creates the canonical PayTR callback hash from the official existing vector", () => {
  assert.equal(createPaytrIframeCallbackHash({
    credential,
    merchantOid,
    status: "success",
    totalAmount: "3600",
  }), "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=");
});

test("exports the canonical callback signer through the provider and package boundaries", () => {
  const input = {
    credential,
    merchantOid,
    status: "success" as const,
    totalAmount: "3600",
  };
  assert.equal(
    createPaytrIframeCallbackHashFromAdapter(input),
    "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
  );
  assert.equal(
    createPaytrIframeCallbackHashFromPackage(input),
    "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
  );
});

test("callback signer rejects noncanonical or hostile authority without mutating caller credentials", () => {
  const canonical = {
    credential,
    merchantOid,
    status: "success" as const,
    totalAmount: "3600",
  };
  for (const input of [
    { ...canonical, extra: true },
    { ...canonical, totalAmount: "03600" },
    { ...canonical, status: "pending" },
    new Proxy(canonical, {}),
  ]) {
    assert.throws(
      () => createPaytrIframeCallbackHash(input as never),
      /paytr_invalid/,
    );
  }
  assert.deepEqual(credential, {
    merchantId: "123456",
    merchantKey: "test-merchant-key",
    merchantSalt: "test-merchant-salt",
  });
});

test("zeroes each exact temporary secret encoding once after credential parse and wipe", () => {
  const captured: CapturedEncoding[] = [];
  let parsed: ReturnType<typeof parsePaytrIframeCredential> | undefined;
  captureSecretEncodings(captured, () => {
    parsed = parsePaytrIframeCredential(credential);
  });

  assertExactSecretEncodingsAreZero(captured);
  assert.deepEqual(parsed, credential);
  assert.ok(parsed !== undefined);
  wipePaytrCredential(parsed);
  assert.deepEqual(parsed, { merchantId: "", merchantKey: "", merchantSalt: "" });
  assertExactSecretEncodingsAreZero(captured);
});

test("zeroes every temporary key and salt encoding when credential parsing fails", () => {
  const invalidSalt = `${credential.merchantSalt}\u0085`;
  const captured: CapturedEncoding[] = [];
  assert.throws(
    () => captureSecretEncodings(
      captured,
      () => { parsePaytrIframeCredential({ ...credential, merchantSalt: invalidSalt }); },
      new Set([credential.merchantKey, invalidSalt]),
    ),
    /paytr_credential_invalid/,
  );

  assert.deepEqual(captured.map(({ source }) => source), [
    credential.merchantKey,
    invalidSalt,
  ]);
  assert.equal(captured.every(({ bytes }) => bytes.every((byte) => byte === 0)), true);
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
