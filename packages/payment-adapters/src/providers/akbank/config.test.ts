import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { createAkbankHmac, parseAkbankCredential, verifyAkbankHmac, wipeAkbankCredential } from "./config.ts";

const credential = { merchantSafeId: "1".repeat(32), terminalSafeId: "2".repeat(32), secretKey: "celebix-documentation-fixture-only" };
const inquiry = '{"version":"1.00","txnCode":"1010","requestDateTime":"2026-10-25T12:30:00.000","randomNumber":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","terminal":{"merchantSafeId":"11111111111111111111111111111111","terminalSafeId":"22222222222222222222222222222222"},"order":{"orderId":"celebix-fixture-0001"}}';
const goldenMac = "U6jcB9EK7u3xQLGmbVt6ePf/M1ZcQ9hS4qxTCy4JlFZ2VcW+vkuvd3mWv32RdLLOq2TQ6OUeEjlTHTGn/Gkn0Q==";

test("literal UTF-8 key signs exact JSON bytes with the independent documentation vector", () => {
  const body = new TextEncoder().encode(inquiry);
  assert.equal(createAkbankHmac({ credential, body }), goldenMac);
  assert.equal(verifyAkbankHmac({ credential, body, providedSignature: goldenMac }), true);
  assert.equal(verifyAkbankHmac({ credential, body: new TextEncoder().encode(`${inquiry}\n`), providedSignature: goldenMac }), false);
  assert.equal(body[0], 123);
});

test("hex-looking secrets remain literal strings and malformed Base64 is rejected", () => {
  const body = new TextEncoder().encode("signed body");
  const selected = { ...credential, secretKey: "abcdef0123456789" };
  const expected = createHmac("sha512", "abcdef0123456789").update(body).digest("base64");
  assert.equal(createAkbankHmac({ credential: selected, body }), expected);
  for (const signature of [expected.slice(0, -1), `${expected}\n`, "A".repeat(88), "", "Ü".repeat(88)]) {
    assert.equal(verifyAkbankHmac({ credential: selected, body, providedSignature: signature }), false);
  }
});

test("credential parsing rejects unexpected shape and accessors without reading them", () => {
  let reads = 0;
  const accessor = { ...credential };
  Object.defineProperty(accessor, "secretKey", { enumerable: true, get() { reads += 1; return "secret"; } });
  for (const value of [accessor, new Proxy(credential, {}), { ...credential, merchantSafeId: "1".repeat(31) }, { ...credential, terminalSafeId: " ".repeat(32) }, { ...credential, secretKey: "a\nb" }, { ...credential, secretKey: "a b" }, { ...credential, secretKey: "\ud800" }, { ...credential, url: "https://other.example" }]) {
    assert.throws(() => parseAkbankCredential(value), /akbank_credential_invalid/);
  }
  assert.equal(reads, 0);
});

test("credential copies can be wiped without mutating their caller", () => {
  const parsed = parseAkbankCredential(credential);
  assert.deepEqual(parsed, credential);
  wipeAkbankCredential(parsed);
  assert.deepEqual(parsed, { merchantSafeId: "", terminalSafeId: "", secretKey: "" });
  assert.equal(credential.secretKey, "celebix-documentation-fixture-only");
});

test("HMAC API rejects accessor and proxy envelopes without observing secret-bearing properties", () => {
  let reads = 0;
  const body = new TextEncoder().encode("signed body");
  const hostile = { body, get credential() { reads += 1; return credential; } };
  assert.throws(() => createAkbankHmac(hostile), /akbank_config_invalid/);
  assert.throws(() => createAkbankHmac(new Proxy({credential,body},{})), /akbank_config_invalid/);
  const hostileVerification = Object.defineProperty({body,providedSignature:goldenMac},"credential",{enumerable:true,get(){reads += 1;return credential;}});
  assert.equal(verifyAkbankHmac(hostileVerification as {credential:typeof credential;body:Uint8Array;providedSignature:string}),false);
  assert.equal(reads,0);
});

test("HMAC rejects exotic byte containers and oversize payloads", () => {
  for (const body of [Buffer.from("body"),new Uint8Array(),new Uint8Array(1_048_577),new Proxy(new Uint8Array([1]),{})]) {
    assert.throws(() => createAkbankHmac({credential,body}),/akbank_config_invalid/);
  }
});

test("HMAC reads typed array bounds intrinsically without invoking shadowing accessors", () => {
  let reads = 0;
  const body = new TextEncoder().encode("signed body");
  const expected = createHmac("sha512",credential.secretKey).update(body).digest("base64");
  Object.defineProperty(body,"byteLength",{get(){ reads += 1; throw new Error("read trap"); }});
  Object.defineProperty(body,"buffer",{get(){ reads += 1; throw new Error("read trap"); }});
  assert.equal(createAkbankHmac({credential,body}),expected);
  assert.equal(reads,0);
});
