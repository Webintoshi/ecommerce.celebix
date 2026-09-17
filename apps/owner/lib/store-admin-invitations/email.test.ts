import assert from "node:assert/strict";
import test from "node:test";

import type { InvitationDeliveryPayload } from "./seal.ts";
import { renderInvitationEmail } from "./email.ts";

const INVALID = "store_admin_invitation_email_invalid";
const TOKEN = Buffer.alloc(32, 7).toString("base64url");
const ACCEPTANCE_URL = `https://accounts.celebix.co/invitations/accept#token=${TOKEN}`;
const payload: InvitationDeliveryPayload = Object.freeze({
  token: TOKEN,
  recipient: "pilot+admin@example.com",
  sender: "davet@notify.celebix.co",
  displayName: "Ada & 'Can'",
  storeName: "Güzide & \"Oğlu\"",
  role: "admin",
  expiresAt: "2026-09-23T19:00:00.000Z",
  acceptanceOrigin: "https://accounts.celebix.co",
});
function rejectsInvalid(candidate: unknown): void {
  assert.throws(
    () => renderInvitationEmail(candidate as InvitationDeliveryPayload),
    (error: unknown) => error instanceof Error && error.message === INVALID,
  );
}

test("renders one deterministic Turkish invitation with escaped HTML and a fragment-only token", () => {
  const first = renderInvitationEmail(payload);
  const second = renderInvitationEmail(payload);

  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(first, {
    from: "davet@notify.celebix.co",
    to: "pilot+admin@example.com",
    subject: "Mağaza yönetim daveti",
    html: `<p>Merhaba Ada &amp; &#39;Can&#39;,</p><p>Güzide &amp; &quot;Oğlu&quot; mağazasını <strong>Yönetici</strong> rolüyle yönetmeniz için davet edildiniz.</p><p><a href="${ACCEPTANCE_URL}">Daveti kabul et</a></p><p>Giriş yaparken davet edilen e-posta adresini (pilot+admin@example.com) kullanın. Yetkiniz yalnızca daveti açıkça kabul ettikten sonra başlar.</p><p>Davetin son kullanma zamanı: 2026-09-23T19:00:00.000Z</p>`,
    text: `Merhaba Ada & 'Can',\n\nGüzide & "Oğlu" mağazasını Yönetici rolüyle yönetmeniz için davet edildiniz.\n\nDaveti kabul etmek için:\n${ACCEPTANCE_URL}\n\nGiriş yaparken davet edilen e-posta adresini (pilot+admin@example.com) kullanın. Yetkiniz yalnızca daveti açıkça kabul ettikten sonra başlar.\n\nDavetin son kullanma zamanı: 2026-09-23T19:00:00.000Z`,
  });
  assert.equal(first.html.includes("<script"), false);
  assert.equal(first.subject.includes(TOKEN), false);
  assert.equal(first.from.includes(TOKEN), false);
  assert.equal(first.to.includes(TOKEN), false);
  assert.equal(first.html.replace(ACCEPTANCE_URL, "").includes(TOKEN), false);
  assert.equal(first.text.replace(ACCEPTANCE_URL, "").includes(TOKEN), false);
  assert.equal(new URL(ACCEPTANCE_URL).search, "");
});

test("maps all three roles without granting authority or inferring delivery", () => {
  const cases = [
    ["admin", "Yönetici"],
    ["editor", "Editör"],
    ["analyst", "Analist"],
  ] as const;

  for (const [role, label] of cases) {
    const rendered = renderInvitationEmail({ ...payload, role });
    assert.match(rendered.html, new RegExp(`<strong>${label}</strong>`, "u"));
    assert.match(rendered.text, new RegExp(` ${label} rolüyle `, "u"));
    assert.deepEqual(Object.keys(rendered).sort(), ["from", "html", "subject", "text", "to"]);
  }
});

test("past expiry remains renderable because eligibility belongs to the future worker", () => {
  const rendered = renderInvitationEmail({ ...payload, expiresAt: "2020-01-01T00:00:00.000Z" });
  assert.match(rendered.text, /2020-01-01T00:00:00\.000Z/u);
});

test("rejects extra, missing, accessor-backed, and non-plain payloads", () => {
  rejectsInvalid({ ...payload, extra: "private" });
  rejectsInvalid(Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "role")));
  rejectsInvalid(Object.assign(Object.create({}), payload));

  let getterCalled = false;
  const accessorPayload = Object.create(null, Object.fromEntries(Object.entries(payload).map(([key, value]) => [
    key,
    key === "token"
      ? { enumerable: true, get: () => { getterCalled = true; return value; } }
      : { enumerable: true, value },
  ])));
  rejectsInvalid(accessorPayload);
  assert.equal(getterCalled, false);

  const symbolic = { ...payload } as InvitationDeliveryPayload & { [key: symbol]: string };
  symbolic[Symbol("secret")] = "private";
  rejectsInvalid(symbolic);
});

test("rejects malformed or noncanonical token, email, name, role, expiry, and origin fields", () => {
  for (const candidate of [
    { ...payload, token: `${TOKEN}=` },
    { ...payload, recipient: "Pilot+Admin@example.com" },
    { ...payload, sender: " davet@notify.celebix.co" },
    { ...payload, displayName: " Ada" },
    { ...payload, displayName: "Ada<Admin>" },
    { ...payload, storeName: "Güzide\nKuyumcu" },
    { ...payload, storeName: "x".repeat(161) },
    { ...payload, role: "owner" },
    { ...payload, expiresAt: "2026-09-23T19:00:00Z" },
    { ...payload, expiresAt: "2026-02-30T19:00:00.000Z" },
    { ...payload, acceptanceOrigin: "https://accounts.celebix.co/" },
  ]) rejectsInvalid(candidate);
});
