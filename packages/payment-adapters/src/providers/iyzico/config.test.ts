import assert from "node:assert/strict";
import test from "node:test";

import {
  createIyzicoAuthorization as createIyzicoAuthorizationFromPackage,
  verifyIyzicoRetrieveResponseSignature as verifyIyzicoRetrieveResponseSignatureFromPackage,
} from "../../index.ts";
import {
  createIyzicoAuthorization,
  createIyzicoInitializeResponseSignature,
  createIyzicoRetrieveResponseSignature,
  normalizeIyzicoSignatureAmount,
  parseIyzicoCredential,
  verifyIyzicoInitializeResponseSignature,
  verifyIyzicoRetrieveResponseSignature,
  wipeIyzicoCredential,
} from "./config.ts";

const credential = Object.freeze({
  apiKey: "sandbox-example-api-key",
  secretKey: "not-a-real-iyzico-secret",
});
const randomKey = "1722246017090123456789";
const uriPath = "/payment/bin/check";
const bodyText = '{"binNumber":"589004"}';
const conversationId = "attempt_01HZY6JNW8QQHZXVYQ1YGZKQ1A";
const token = "0f82d318-212a-4ca5-9f11-feca852236cb";

const initializeInput = Object.freeze({
  credential,
  conversationId,
  token,
});

const retrieveInput = Object.freeze({
  credential,
  paymentStatus: "SUCCESS",
  paymentId: "28494561",
  currency: "TRY",
  basketId: "order_123",
  conversationId,
  paidPrice: "10.50",
  price: "10.00",
  token,
});

type CapturedEncoding = Readonly<{
  source: string;
  bytes: Uint8Array;
}>;

function captureSecretEncodings(
  operation: () => void,
  secrets: ReadonlySet<string> = new Set([credential.secretKey]),
): CapturedEncoding[] {
  const captured: CapturedEncoding[] = [];
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
  return captured;
}

function assertCapturedSecretsWereWiped(captured: CapturedEncoding[]): void {
  assert.equal(captured.length > 0, true);
  assert.equal(
    captured.every(({ bytes }) => bytes.every((byte) => byte === 0)),
    true,
  );
}

test("parses only an exact writable iyzico credential and supports explicit wiping", () => {
  const parsed = parseIyzicoCredential(credential);
  assert.deepEqual(parsed, credential);
  assert.equal(Object.isFrozen(parsed), false);
  wipeIyzicoCredential(parsed);
  assert.deepEqual(parsed, { apiKey: "", secretKey: "" });

  const accessor = { ...credential };
  Object.defineProperty(accessor, "secretKey", {
    enumerable: true,
    get() { throw new Error("secret accessor must not execute"); },
  });
  const inherited = Object.create(credential) as Record<string, unknown>;
  const withSymbol = { ...credential } as Record<PropertyKey, unknown>;
  withSymbol[Symbol("secret")] = "hidden";
  for (const value of [
    { ...credential, environment: "live" },
    { ...credential, apiKey: "" },
    { ...credential, secretKey: "" },
    inherited,
    accessor,
    withSymbol,
    new Proxy({ ...credential }, {}),
  ]) {
    assert.throws(() => parseIyzicoCredential(value), /iyzico_credential_invalid/);
  }
  assert.deepEqual(parseIyzicoCredential(Object.freeze({ ...credential })), credential);
});

test("rejects whitespace, controls, unsafe api-key delimiters, and invalid Unicode", () => {
  for (const apiKey of [
    " sandbox-key",
    "sandbox key",
    "sandbox-key\n",
    "sandbox&key",
    "sandbox-anahtar-ş",
    `sandbox-${"a".repeat(249)}`,
  ]) {
    assert.throws(
      () => parseIyzicoCredential({ ...credential, apiKey }),
      /iyzico_credential_invalid/,
    );
  }
  for (const secretKey of [
    " secret",
    "secret key",
    "secret\u0085key",
    "secret\uD800key",
    "ş".repeat(129),
  ]) {
    assert.throws(
      () => parseIyzicoCredential({ ...credential, secretKey }),
      /iyzico_credential_invalid/,
    );
  }

  assert.deepEqual(
    parseIyzicoCredential({ apiKey: "a".repeat(256), secretKey: "ş".repeat(128) }),
    { apiKey: "a".repeat(256), secretKey: "ş".repeat(128) },
  );
});

test("wipes temporary secret encodings on successful and failed credential parsing", () => {
  const successful = captureSecretEncodings(() => {
    const selected = parseIyzicoCredential(credential);
    wipeIyzicoCredential(selected);
  });
  assertCapturedSecretsWereWiped(successful);

  const invalidSecret = `${credential.secretKey}\u0085`;
  const failed = captureSecretEncodings(
    () => assert.throws(
      () => parseIyzicoCredential({ ...credential, secretKey: invalidSecret }),
      /iyzico_credential_invalid/,
    ),
    new Set([invalidSecret]),
  );
  assertCapturedSecretsWereWiped(failed);
});

test("matches the deterministic IYZWSv2 golden vector over exact transported UTF-8 bytes", () => {
  const body = new TextEncoder().encode(bodyText);
  const result = createIyzicoAuthorization({
    credential,
    randomKey,
    uriPath,
    body,
  });
  assert.deepEqual(result, {
    authorization: "IYZWSv2 YXBpS2V5OnNhbmRib3gtZXhhbXBsZS1hcGkta2V5JnJhbmRvbUtleToxNzIyMjQ2MDE3MDkwMTIzNDU2Nzg5JnNpZ25hdHVyZToyMTI3MDViYzlhNDQ3MjUxZmU5MTc0MWMwNjMwNmU5MDk4MGRmYTk4MzlhNjI4MjIyYmYxNTRiNzAwYjMzNzFh",
    randomKey,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(new TextDecoder().decode(body), bodyText);
  assert.deepEqual(createIyzicoAuthorizationFromPackage({
    credential,
    randomKey,
    uriPath,
    body,
  }), result);
  assert.deepEqual(credential, {
    apiKey: "sandbox-example-api-key",
    secretKey: "not-a-real-iyzico-secret",
  });
});

test("binds authorization to the raw JSON bytes and wipes every temporary secret encoding", () => {
  const compact = new TextEncoder().encode('{"binNumber":"589004","note":"İ"}');
  const spaced = new TextEncoder().encode('{"binNumber": "589004", "note":"I\u0307"}');
  let first = "";
  let second = "";
  const captured = captureSecretEncodings(() => {
    first = createIyzicoAuthorization({ credential, randomKey, uriPath, body: compact }).authorization;
    second = createIyzicoAuthorization({ credential, randomKey, uriPath, body: spaced }).authorization;
  });
  assert.notEqual(first, second);
  assertCapturedSecretsWereWiped(captured);
  assert.equal(new TextDecoder().decode(compact), '{"binNumber":"589004","note":"İ"}');
  assert.equal(new TextDecoder().decode(spaced), '{"binNumber": "589004", "note":"I\u0307"}');
});

test("rejects hostile or out-of-contract authorization authority", () => {
  const canonical = {
    credential,
    randomKey,
    uriPath,
    body: new TextEncoder().encode(bodyText),
  };
  const accessor = { ...canonical };
  Object.defineProperty(accessor, "body", {
    enumerable: true,
    get() { throw new Error("body accessor must not execute"); },
  });
  for (const input of [
    { ...canonical, endpoint: "https://attacker.example" },
    { ...canonical, randomKey: "short" },
    { ...canonical, randomKey: "a".repeat(257) },
    { ...canonical, randomKey: "a".repeat(15) + "+" },
    { ...canonical, uriPath: "/payment/bin/check?redirect=attacker" },
    { ...canonical, uriPath: "/attacker" },
    { ...canonical, body: new Uint8Array() },
    { ...canonical, body: new Proxy(canonical.body, {}) },
    accessor,
    new Proxy(canonical, {}),
  ]) {
    assert.throws(() => createIyzicoAuthorization(input as never), /iyzico_config_invalid/);
  }
});

test("uses the official Checkout Form initialize response-signature order", () => {
  assert.equal(
    createIyzicoInitializeResponseSignature(initializeInput),
    "03f8bcd169ee98917107a040e8ecf9417b03b068952f0104b977a53a351c0bad",
  );
  assert.equal(verifyIyzicoInitializeResponseSignature({
    ...initializeInput,
    providedSignature: "03f8bcd169ee98917107a040e8ecf9417b03b068952f0104b977a53a351c0bad",
  }), true);
  assert.equal(verifyIyzicoInitializeResponseSignature({
    ...initializeInput,
    providedSignature: "13f8bcd169ee98917107a040e8ecf9417b03b068952f0104b977a53a351c0bad",
  }), false);
});

test("uses the official Checkout Form retrieve response-signature order and amount normalization", () => {
  assert.equal(
    createIyzicoRetrieveResponseSignature(retrieveInput),
    "7432e38a10e7216c0efd0050ed40e91f19ae39bd3b0aea2f87fa2d42a798b00f",
  );
  const verificationInput = {
    ...retrieveInput,
    providedSignature: "7432e38a10e7216c0efd0050ed40e91f19ae39bd3b0aea2f87fa2d42a798b00f",
  };
  assert.equal(verifyIyzicoRetrieveResponseSignature(verificationInput), true);
  assert.equal(verifyIyzicoRetrieveResponseSignatureFromPackage(verificationInput), true);
  assert.equal(verifyIyzicoRetrieveResponseSignature({
    ...verificationInput,
    providedSignature: "7432e38a10e7216c0efd0050ed40e91f19ae39bd3b0aea2f87fa2d42a798b01f",
  }), false);
});

test("normalizes only canonical non-negative iyzico signature amounts", () => {
  for (const [input, expected] of [
    ["10", "10"],
    ["10.0", "10"],
    ["10.5", "10.5"],
    ["10.50", "10.5"],
    ["10.510", "10.51"],
    ["10.5105", "10.5105"],
    ["10.51050", "10.5105"],
    [50, "50"],
    [10.5, "10.5"],
  ] as const) {
    assert.equal(normalizeIyzicoSignatureAmount(input), expected);
  }
  for (const input of [
    "", " 10", "10 ", "01", ".5", "10.", "-1", "+1", "1e2",
    "1.123456789", "10000000000000", Number.NaN, Number.POSITIVE_INFINITY,
    -0, -1, 0.1 + 0.2, {}, new String("10.0"),
  ]) {
    assert.throws(() => normalizeIyzicoSignatureAmount(input), /iyzico_config_invalid/);
  }
});

test("response signature verifiers fail closed for malformed, hostile, and reordered data", () => {
  const canonical = {
    ...retrieveInput,
    providedSignature: "7432e38a10e7216c0efd0050ed40e91f19ae39bd3b0aea2f87fa2d42a798b00f",
  };
  const accessor = { ...canonical };
  Object.defineProperty(accessor, "token", {
    enumerable: true,
    get() { throw new Error("token accessor must not execute"); },
  });
  for (const input of [
    { ...canonical, extra: true },
    { ...canonical, token: `${token}:suffix` },
    { ...canonical, conversationId: "değiştirildi" },
    { ...canonical, paidPrice: "010.50" },
    { ...canonical, providedSignature: "" },
    { ...canonical, providedSignature: canonical.providedSignature.toUpperCase() },
    { ...canonical, providedSignature: canonical.providedSignature.slice(1) },
    accessor,
    new Proxy(canonical, {}),
  ]) {
    assert.equal(verifyIyzicoRetrieveResponseSignature(input as never), false);
  }
});

test("wipes temporary secret encodings after every response-signature path", () => {
  const captured = captureSecretEncodings(() => {
    assert.equal(createIyzicoInitializeResponseSignature(initializeInput).length, 64);
    assert.equal(createIyzicoRetrieveResponseSignature(retrieveInput).length, 64);
    assert.equal(verifyIyzicoInitializeResponseSignature({
      ...initializeInput,
      providedSignature: "0".repeat(64),
    }), false);
    assert.equal(verifyIyzicoRetrieveResponseSignature({
      ...retrieveInput,
      providedSignature: "0".repeat(64),
    }), false);
  });
  assertCapturedSecretsWereWiped(captured);
});
