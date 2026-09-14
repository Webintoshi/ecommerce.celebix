import assert from "node:assert/strict";
import test from "node:test";

import type { StoreDomainReplacementView, StoreDomainView } from "@celebix/saas-contracts";

import { getStoreDomainProgress, getStoreDomainReplacementPresentation, getStoreDomainStatusPresentation } from "./presentation.ts";

const DOMAIN = Object.freeze({
  schemaVersion: 1, id: "77000000-0000-4000-8000-000000000088", hostname: "shop.example.com", hostnameType: "custom_domain",
  status: "pending", primary: false, uiStatus: "hostname_pending", dnsInstructions: [], verifiedAt: null, version: 1,
  createdAt: "2026-08-05T10:00:00.000Z", updatedAt: "2026-08-05T10:00:00.000Z",
}) as StoreDomainView;

test("maps durable lifecycle states to short Turkish status labels", () => {
  assert.deepEqual(getStoreDomainStatusPresentation({ ...DOMAIN, uiStatus: "dns_pending" }), { label: "DNS bekleniyor", tone: "pending" });
  assert.deepEqual(getStoreDomainStatusPresentation(DOMAIN), { label: "Alan adı ekleniyor", tone: "pending" });
  assert.deepEqual(getStoreDomainStatusPresentation({ ...DOMAIN, uiStatus: "action_required" }), { label: "DNS ayarı gerekli", tone: "warning" });
  assert.deepEqual(getStoreDomainStatusPresentation({ ...DOMAIN, status: "active", uiStatus: "active" }), { label: "Yayında", tone: "success" });
  assert.deepEqual(getStoreDomainStatusPresentation({ ...DOMAIN, hostnameType: "platform_subdomain", status: "active", uiStatus: "active" }), { label: "Celebix adresi", tone: "success" });
});

test("progress derives only from server lifecycle state", () => {
  assert.equal(getStoreDomainProgress(DOMAIN), 1);
  assert.equal(getStoreDomainProgress({ ...DOMAIN, uiStatus: "action_required" }), 2);
  assert.equal(getStoreDomainProgress({ ...DOMAIN, uiStatus: "ssl_pending" }), 3);
  assert.equal(getStoreDomainProgress({ ...DOMAIN, uiStatus: "origin_pending" }), 3);
  assert.equal(getStoreDomainProgress({ ...DOMAIN, status: "active", uiStatus: "active" }), 4);
});

test("replacement states explain safe preparation activation and rollback in Turkish", () => {
  const replacement = { schemaVersion: 1, id: "79000000-0000-4000-8000-000000000088", sourceStorefrontDomainId: DOMAIN.id, targetStorefrontDomainId: "76000000-0000-4000-8000-000000000088", targetAdminDomainId: "75000000-0000-4000-8000-000000000088", status: "preparing", ready: false, version: 1, createdAt: DOMAIN.createdAt, updatedAt: DOMAIN.updatedAt } satisfies StoreDomainReplacementView;
  assert.deepEqual(getStoreDomainReplacementPresentation(replacement), { label: "Yeni adres hazırlanıyor", tone: "pending", action: "cancel" });
  assert.deepEqual(getStoreDomainReplacementPresentation({ ...replacement, ready: true }), { label: "Geçişe hazır", tone: "success", action: "activate" });
  assert.deepEqual(getStoreDomainReplacementPresentation({ ...replacement, status: "activated", ready: true }), { label: "Yeni adres birincil", tone: "success", action: "rollback" });
  assert.deepEqual(getStoreDomainReplacementPresentation({ ...replacement, status: "rolled_back", ready: true }), { label: "Eski adrese dönüldü", tone: "warning", action: null });
});
