import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStorefrontAccountPhone } from "./phone.ts";
import { parseStorefrontIdentityKeyring } from "./credential.ts";
import { phoneIdentityDigest, phoneRequestDigest, phoneCodeDigest, sealPhoneChallenge, openPhoneChallenge } from "./phone-credential.ts";

test("phone input accepts Turkish national and explicit international numbers without changing identity", () => {
  for (const number of ["0452 606 05 52", "4526060552", "+90 (452) 606-05-52", "00904526060552"]) assert.equal(normalizeStorefrontAccountPhone(number), "+904526060552");
  assert.equal(normalizeStorefrontAccountPhone("+4915112345678"), "+4915112345678");
  for (const number of ["", "123", "+9004526060552", "4526060552<script>", "+904526060552\n", "0".repeat(70)]) assert.throws(() => normalizeStorefrontAccountPhone(number));
});

const keyring = parseStorefrontIdentityKeyring("phone_01", JSON.stringify([{keyId:"phone_01",key:Buffer.alloc(32,8).toString("base64url")} ]));
const challenge = {challengeId:"10000000-0000-4000-8000-000000000001",hostname:"alpler-spor.saas-staging.celebix.net",phone:"+904526060552",firstName:"Cemo",lastName:"Test",expiresAt:"2026-10-01T14:10:00.000Z",hmacKeyId:"phone_01"};
test("phone request budget uses an opaque authority independent of storefront aliases", () => {
  const authority = "203.0.113.12";
  assert.match(phoneRequestDigest(authority,keyring).digest,/^[a-f0-9]{64}$/u);
  assert.notEqual(phoneRequestDigest(authority,keyring).digest,phoneRequestDigest("203.0.113.13",keyring).digest);
  assert.throws(() => phoneRequestDigest("",keyring));
});
test("phone challenge authenticates its hostname, identity, names and key version", () => {
  const sealed = sealPhoneChallenge(challenge,keyring,size=>new Uint8Array(size).fill(3));
  assert.deepEqual(openPhoneChallenge(sealed,keyring),challenge);
  assert.equal(sealed.includes(challenge.phone),false);
  assert.equal(openPhoneChallenge(sealed.replace("ph1.","ch1."),keyring),null);
  assert.equal(openPhoneChallenge(sealed.slice(0,-2)+"AA",keyring),null);
  assert.notEqual(phoneIdentityDigest(challenge.hostname,challenge.phone,keyring).digest,phoneIdentityDigest("other.saas-staging.celebix.net",challenge.phone,keyring).digest);
  assert.notEqual(phoneCodeDigest({...challenge,code:"000001"},keyring).digest,phoneCodeDigest({...challenge,code:"000002"},keyring).digest);
});
