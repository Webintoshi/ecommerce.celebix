import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildStoreAdminInvitationUrl,
  createStoreAdminInvitationToken,
  digestStoreAdminInvitationToken,
} from "./token.ts";

function rejectsInvalid(operation: () => unknown): void {
  assert.throws(operation, (error: unknown) => error instanceof Error && error.message === "store_admin_invitation_token_invalid");
}

test("token entropy and canonical digest", () => {
  const a = createStoreAdminInvitationToken();
  const b = createStoreAdminInvitationToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.token.length, 43);
  assert.equal(Buffer.from(a.token, "base64url").length, 32);
  assert.equal(digestStoreAdminInvitationToken(a.token), a.digest);
  assert.match(a.digest, /^[a-f0-9]{64}$/u);
  assert.equal(
    a.digest,
    createHash("sha256")
      .update("celebix-store-admin-invitation-token:v1\n")
      .update(a.token, "utf8")
      .digest("hex"),
  );
});

test("token validation rejects malformed and noncanonical encodings without disclosing input", () => {
  const valid = Buffer.alloc(32, 255).toString("base64url");
  assert.doesNotThrow(() => digestStoreAdminInvitationToken(valid));
  for (const invalid of [undefined, null, "", "a".repeat(42), "a".repeat(44), `${valid}=`, valid.replace("_", "/"), `${valid.slice(0, -1)}9`]) {
    rejectsInvalid(() => digestStoreAdminInvitationToken(invalid));
  }
});

test("acceptance URL uses a canonical HTTPS origin and a fragment token", () => {
  const token = Buffer.alloc(32, 7).toString("base64url");
  const url = buildStoreAdminInvitationUrl("https://accounts.celebix.co", token);
  assert.equal(url, `https://accounts.celebix.co/invitations/accept#token=${token}`);
  assert.equal(new URL(url).search, "");
});

test("acceptance URL rejects noncanonical or open-redirect-capable origins", () => {
  const token = Buffer.alloc(32, 7).toString("base64url");
  for (const origin of [
    "http://accounts.celebix.co",
    "https://accounts.celebix.co:443",
    "https://user@accounts.celebix.co",
    "https://accounts.celebix.co/path",
    "https://accounts.celebix.co/?next=https://evil.test",
    "https://accounts.celebix.co/#evil",
    "https://accounts.celebix.co/\\evil.test",
    " https://accounts.celebix.co",
    "https://accounts.celebix.co/",
  ]) {
    rejectsInvalid(() => buildStoreAdminInvitationUrl(origin, token));
  }
});
