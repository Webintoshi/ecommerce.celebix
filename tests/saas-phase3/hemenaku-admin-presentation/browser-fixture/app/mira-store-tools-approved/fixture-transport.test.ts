import assert from "node:assert/strict";
import test from "node:test";
import { createMerchantAdminApi, MerchantAdminApiError } from "../../../../../../apps/customer-panel/lib/merchant-admin-ui/client.ts";
import { createStoreToolsFixtureTransport } from "./fixture-transport.ts";

const origin = "http://127.0.0.1:3547";
const operation = "a8100000-0000-4000-8000-000000000001";

test("fixture returns valid enabled contact channels and same-store page/language records", async () => {
  const transport = createStoreToolsFixtureTransport({ state: "loaded", origin });
  const api = createMerchantAdminApi(transport.fetch);
  const [contact] = await api.records("contact_widget");
  assert.deepEqual((contact.config.channels as any[]).filter(channel => channel.enabled).map(channel => channel.type), ["whatsapp", "phone", "instagram"]);
  assert.equal((await api.records("page"))[0].config.slug, "iletisim");
  assert.equal((await api.records("language_setting"))[0].config.defaultLocale, "tr-TR");
  assert.equal(transport.snapshot().liveWrites, false);
});

test("memory-only save advances version once and exact replay preserves its version", async () => {
  const transport = createStoreToolsFixtureTransport({ state: "loaded", origin });
  const api = createMerchantAdminApi(transport.fetch);
  const [record] = await api.records("contact_widget");
  const value = { recordId: record.id, expectedVersion: record.version, name: record.name, status: "active" as const, config: { ...record.config, title: "Yerel destek ekibi" } };
  const first = await api.save("contact_widget", value, operation);
  const replay = await api.save("contact_widget", value, operation);
  assert.equal(first.version, 4); assert.equal(replay.version, 4); assert.equal(replay.replayed, true);
  assert.equal((await api.records("contact_widget"))[0].config.title, "Yerel destek ekibi");
});

test("conflict and unavailable outcomes leave the submitted changes outside saved state", async () => {
  for (const state of ["conflict", "error"] as const) {
    const transport = createStoreToolsFixtureTransport({ state, origin });
    const api = createMerchantAdminApi(transport.fetch);
    const [record] = await api.records("contact_widget");
    await assert.rejects(api.save("contact_widget", { recordId: record.id, expectedVersion: record.version, name: record.name, status: "active", config: { ...record.config, title: "Kaydedilmeyen taslak" } }, operation), error => error instanceof MerchantAdminApiError && error.code === (state === "conflict" ? "version_conflict" : "unavailable"));
    assert.notEqual((await api.records("contact_widget"))[0].config.title, "Kaydedilmeyen taslak");
  }
});

test("foreign origins, unexpected API paths and unauthorized writes fail closed", async () => {
  const transport = createStoreToolsFixtureTransport({ state: "readonly", origin });
  for (const request of ["https://admin.guzidekuyumcu.com/api/merchant-admin/records/contact_widget", "/api/unknown", "/api/merchant-admin/records/contact_widget?scope=other"]) assert.equal((await transport.fetch(request)).status, 403);
  assert.equal((await transport.fetch("/api/session/logout", { method: "POST" })).status, 403);
  assert.equal((await transport.fetch("/api/merchant-admin/records/contact_widget", { method: "POST", body: "{}" })).status, 403);
  assert.equal(transport.snapshot().record.version, 3);
  assert.equal(transport.snapshot().calls.filter(call => call.blocked).length, 4);
});

test("restock fixture reads masked stats and saves only its own version with replay protection", async () => {
  const transport = createStoreToolsFixtureTransport({ state: "loaded", origin });
  const api = createMerchantAdminApi(transport.fetch);
  const [record] = await api.records("restock_alerts");
  const value = { recordId: record.id, expectedVersion: record.version, name: record.name, status: "active" as const, config: { ...record.config, title: "Yerel stok bildirimi" } };
  const first = await api.save("restock_alerts", value, operation);
  const replay = await api.save("restock_alerts", value, operation);
  assert.equal(first.version, 3); assert.equal(replay.version, 3); assert.equal(replay.replayed, true);
  assert.equal(transport.snapshot().record.version, 3);
  assert.equal(transport.snapshot().record.config.title, "Size nasıl yardımcı olabiliriz?");
  assert.equal(transport.snapshot().restock.config.title, "Yerel stok bildirimi");
  const stats = await (await transport.fetch("/api/restock/stats")).json();
  assert.equal(stats.pendingConfirmed, 8); assert.equal(stats.recent[0].emailMask, "a***@ornek.com");
  assert.equal((await transport.fetch("https://admin.guzidekuyumcu.com/api/restock/stats")).status, 403);
  assert.equal((await transport.fetch("/api/restock/stats", { method: "POST" })).status, 403);
});
