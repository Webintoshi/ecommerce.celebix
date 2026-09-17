import assert from "node:assert/strict";
import test from "node:test";
import { invitationRows, deliveryLabel } from "./presentation.ts";
const id = "10000000-0000-4000-8000-000000000001", now = new Date("2026-09-17T12:00:00.000Z");
const source = { id, kind: "administrator_invite", name: "Recipient", config: { email: "recipient@example.test", role: "admin", expiresAt: "2026-09-24T12:00:00.000Z" }, status: "active", version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() } as const;
test("pending lifecycle survives archived or independently capped sources and retains controls without send/edit", () => {
  const item = { id, sourceRecordId: id, email: "snapshot@example.test", displayName: "Snapshot", role: "admin", status: "pending", deliveryStatus: "queued", expiresAt: source.config.expiresAt, createdAt: now.toISOString(), updatedAt: "2026-09-17T11:58:00.000Z", version: 1, generation: 1 } as const;
  for (const records of [[], Array.from({ length: 200 }, (_, index) => ({ ...source, id: `10000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}` }))]) {
    const rows = invitationRows(records, { items: [item], hasMore: true }, now);
    const row = rows.find(row => row.invitation?.id === id)!;
    assert.ok(row); assert.equal(row.email, "snapshot@example.test");
    assert.equal(row.canSend || row.canEdit, false); assert.equal(row.canResend && row.canRevoke, true);
    assert.equal(rows.length, records.length + 1);
  }
});
test("legacy active is unsent only after complete successful lifecycle list and exact source join", () => {
  assert.equal(invitationRows([source], null, now)[0]!.label, "Durum doğrulanamadı");
  assert.equal(invitationRows([source], { items: [], hasMore: true }, now)[0]!.canSend, false);
  const row = invitationRows([source], { items: [], hasMore: false }, now)[0]!;
  assert.equal(row.label, "Henüz gönderilmedi"); assert.equal(row.canSend, true);
  assert.equal(invitationRows([{ ...source, config: { ...source.config, expiresAt: "tomorrow" } }], { items: [], hasMore: false }, now)[0]!.canSend, false);
});
test("lifecycle, delivery and immutable snapshot never imply current membership or inbox delivery", () => {
  const item = { id, sourceRecordId: id, email: "snapshot@example.test", displayName: "Snapshot", role: "admin", status: "accepted", deliveryStatus: "provider_accepted", expiresAt: source.config.expiresAt, createdAt: now.toISOString(), updatedAt: now.toISOString(), version: 1, generation: 1 } as const;
  const row = invitationRows([source], { items: [item], hasMore: false }, now)[0]!;
  assert.equal(row.label, "Davet kabul edildi"); assert.equal(row.email, "snapshot@example.test"); assert.equal(row.canSend || row.canResend || row.canRevoke, false);
  assert.equal(deliveryLabel("provider_accepted"), "E-posta sağlayıcısı kabul etti");
  assert.equal(deliveryLabel("delivered"), "Teslim edildi");
});
