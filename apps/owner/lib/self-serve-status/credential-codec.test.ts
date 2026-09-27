import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { createOnboardingStatusCredentialCodec } from "./credential-codec.ts";
import { ONBOARDING_STATUS_COOKIE, createOnboardingStatusCookie, readOnboardingStatusCookie } from "./cookie.ts";

test("status proof uses 32 bytes and a purpose-separated keyed digest", () => {
  const key = randomBytes(32);
  const entropy = randomBytes(32);
  const codec = createOnboardingStatusCredentialCodec({ key, randomBytes: (size) => {
    assert.equal(size, 32); return entropy;
  } });
  const issued = codec.issue();
  assert.equal(/^os1\.[A-Za-z0-9_-]{43}$/.test(issued.credential), true);
  assert.equal(Buffer.from(issued.credential.slice(4), "base64url").length, 32);
  assert.equal(issued.digest.length, 64);
  assert.equal(codec.digest(issued.credential), issued.digest);
  const otherPurpose = createHmac("sha256", key).update("registration-attempt-state").update(issued.credential).digest("hex");
  assert.notEqual(issued.digest, otherPurpose);
  assert.notEqual(createOnboardingStatusCredentialCodec({ key: randomBytes(32), randomBytes }).digest(issued.credential), issued.digest);
  key.fill(0); entropy.fill(0);
  assert.equal(codec.digest(issued.credential), issued.digest, "key and entropy are copied");
});

test("rejects short entropy, weak keys and noncanonical proof spellings", () => {
  assert.throws(() => createOnboardingStatusCredentialCodec({key:new Uint8Array(31),randomBytes}));
  const codec=createOnboardingStatusCredentialCodec({key:randomBytes(32),randomBytes});
  const issued=codec.issue();
  for(const raw of [null,issued.credential+"="," "+issued.credential,issued.credential+" ",issued.credential.replace("os1.","pb1."),"os1.",issued.credential+"\n"]){
    assert.equal(codec.digest(raw),null);
  }
  assert.throws(()=>createOnboardingStatusCredentialCodec({key:randomBytes(32),randomBytes:()=>new Uint8Array(31)}).issue());
});

test("Owner-only status cookie has fixed 24 hour expiry and safe transport attributes", () => {
  const codec=createOnboardingStatusCredentialCodec({key:randomBytes(32),randomBytes});
  const issued=codec.issue();
  const start=new Date("2026-09-27T10:00:00.000Z");
  const cookie=createOnboardingStatusCookie(issued.credential,start);
  assert.equal(cookie.name,ONBOARDING_STATUS_COOKIE);
  assert.equal(cookie.httpOnly,true);
  assert.equal(cookie.secure,true);
  assert.equal(cookie.sameSite,"lax");
  assert.equal(cookie.path,"/");
  assert.equal(cookie.maxAge,86400);
  assert.equal(cookie.expires.toISOString(),"2026-09-28T10:00:00.000Z");
  assert.equal("domain" in cookie,false);
  const header=new Headers({cookie:`other=x; ${cookie.name}=${cookie.value}`});
  assert.equal(readOnboardingStatusCookie(header),issued.credential);
  assert.equal(cookie.expires.toISOString(),"2026-09-28T10:00:00.000Z", "read does not renew proof");
  assert.equal(readOnboardingStatusCookie(new Headers({cookie:`${cookie.name}=${cookie.value}; ${cookie.name}=${cookie.value}`})),null);
  assert.equal(readOnboardingStatusCookie(new Headers({cookie:`${cookie.name}=%${cookie.value}`})),null);
  assert.equal(readOnboardingStatusCookie(new Headers()),null);
});
