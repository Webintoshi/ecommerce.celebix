import assert from "node:assert/strict";
import test from "node:test";

import type { StoreDomainView } from "@celebix/saas-contracts";

import { getStoreDomainProgress, getStoreDomainStatusPresentation } from "./presentation.ts";

const DOMAIN = Object.freeze({
  schemaVersion: 1, id: "77000000-0000-4000-8000-000000000088", hostname: "shop.example.com", hostnameType: "custom_domain",
  status: "pending", primary: false, uiStatus: "hostname_pending", dnsInstructions: [], verifiedAt: null, version: 1,
  createdAt: "2026-08-05T10:00:00.000Z", updatedAt: "2026-08-05T10:00:00.000Z",
}) as StoreDomainView;

test("maps durable lifecycle states to short Turkish status labels", () => {
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
