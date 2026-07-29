import assert from "node:assert/strict";
import test from "node:test";

import {
  IYZICO_IFRAME_PACKET,
  PAYMENT_ADAPTER_PACKET_INVENTORY,
  createIyzicoCheckoutFormAdapter,
  createPaymentAdapterRegistry,
  parsePaymentAdapterPacket,
  type HostedPaymentAdapter,
  type PaymentAdapterPacket,
} from "./index.ts";

function packetFixture(adapterVersion = 1): Record<string, unknown> {
  return {
    providerCode: "paytr_iframe",
    familyCode: "paytr",
    modeCode: "iframe",
    adapterVersion,
    implementation: "hosted",
    callbackResponse: "provider_ack",
    readiness: { test: "verification", live: "planned" },
    endpoints: {
      test: [
        "https://www.paytr.com/odeme/api/get-token",
        "https://www.paytr.com/odeme/durum-sorgu",
      ],
      live: [
        "https://www.paytr.com/odeme/api/get-token",
        "https://www.paytr.com/odeme/durum-sorgu",
      ],
    },
    presentation: {
      test: {
        kind: "provider_token_url",
        urlPrefix: "https://www.paytr.com/odeme/guvenli/",
        token: { alphabet: "base64url", minimum: 32, maximum: 256 },
      },
      live: {
        kind: "provider_token_url",
        urlPrefix: "https://www.paytr.com/odeme/guvenli/",
        token: { alphabet: "base64url", minimum: 32, maximum: 256 },
      },
    },
    publicFields: [
      { key: "merchantId", label: "Mağaza numarası", minimum: 1, maximum: 128 },
    ],
    credentialFields: [
      { key: "merchantKey", label: "Mağaza parolası", minimum: 1, maximum: 256, secret: true },
      { key: "merchantSalt", label: "Mağaza gizli anahtarı", minimum: 1, maximum: 256, secret: true },
    ],
    capabilities: {
      initialize: true,
      callback: true,
      query: true,
      threeDSecure: true,
      installments: true,
      preAuth: false,
      capture: false,
      cancel: false,
      refund: false,
      partialRefund: false,
      tokenization: false,
    },
    documentation: [
      { url: "https://dev.paytr.com/iframe-api", verifiedAt: "2026-07-27", authority: "official" },
    ],
  };
}

function adapter(packet: PaymentAdapterPacket): HostedPaymentAdapter<object> {
  const parseCredential = Object.freeze((value: unknown) => {
    if (typeof value !== "object" || value === null) throw new TypeError("invalid");
    return Object.freeze({});
  });
  const maskAccount = Object.freeze(() => "merchant…3456");
  const initialize = Object.freeze(async () => (
    Object.freeze({ kind: "pending" as const, providerReference: null })
  ));
  const verifyCallback = Object.freeze(async () => Object.freeze({
    eventKey: "event_fixture",
    status: "failed" as const,
    providerReference: null,
    paidAmountMinor: 0,
    currency: "TRY",
    safeCode: "fixture",
  }));
  const query = Object.freeze(async () => (
    Object.freeze({ kind: "pending" as const, providerReference: null })
  ));
  return Object.freeze({
    packet,
    parseCredential,
    maskAccount,
    initialize,
    verifyCallback,
    query,
  });
}

test("assembles a frozen explicit packet/adapter registry with exact lookups", () => {
  const packet = parsePaymentAdapterPacket(packetFixture());
  const selected = adapter(packet);
  const registry = createPaymentAdapterRegistry([packet], [selected]);

  assert.equal(Object.isFrozen(registry), true);
  assert.equal(registry.size, 1);
  assert.strictEqual(registry.packet("paytr_iframe"), packet);
  assert.strictEqual(registry.adapter("paytr_iframe"), selected);
  for (const code of ["PAYTR_IFRAME", "paytr-iframe", " paytr_iframe", "unknown", ""]) {
    assert.equal(registry.packet(code), null, code);
    assert.equal(registry.adapter(code), null, code);
  }
});

test("accepts an explicit empty registry as the fail-closed production default", () => {
  const registry = createPaymentAdapterRegistry([], []);

  assert.equal(registry.size, 0);
  assert.equal(registry.packet("paytr_iframe"), null);
  assert.equal(registry.adapter("paytr_iframe"), null);
});

test("accepts the explicit iyzico Checkout Form adapter without enabling it by default", () => {
  const request = Object.freeze(async () => Object.freeze({
    kind: "unknown" as const,
    code: "transport_outcome_unknown" as const,
  }));
  const iyzico = createIyzicoCheckoutFormAdapter(
    Object.freeze({ request }),
    Object.freeze({ randomKey: Object.freeze(() => "fixedRandomKey0123456789") }),
  );
  const registry = createPaymentAdapterRegistry(
    [IYZICO_IFRAME_PACKET],
    [iyzico as unknown as HostedPaymentAdapter<object>],
  );

  assert.equal(registry.size, 1);
  assert.strictEqual(registry.packet("iyzico_iframe"), IYZICO_IFRAME_PACKET);
  assert.strictEqual(registry.adapter("iyzico_iframe"), iyzico);
});

test("rejects a mutable query-token rule nested inside an otherwise frozen iyzico packet", () => {
  const testRule = IYZICO_IFRAME_PACKET.presentation.test;
  assert.equal(testRule.kind, "provider_query_token_url");
  const mutableToken = { ...testRule.token };
  const packet = Object.freeze({
    ...IYZICO_IFRAME_PACKET,
    presentation: Object.freeze({
      test: Object.freeze({ ...testRule, token: mutableToken }),
      live: IYZICO_IFRAME_PACKET.presentation.live,
    }),
  });
  const selected = adapter(packet);

  assert.throws(
    () => createPaymentAdapterRegistry([packet], [selected]),
    /payment_adapter_registry_invalid/,
  );
});

test("rejects duplicate packet and adapter provider codes", () => {
  const packet = parsePaymentAdapterPacket(packetFixture());
  const selected = adapter(packet);

  assert.throws(
    () => createPaymentAdapterRegistry([packet, packet], [selected]),
    /payment_adapter_registry_invalid/,
  );
  assert.throws(
    () => createPaymentAdapterRegistry([packet], [selected, selected]),
    /payment_adapter_registry_invalid/,
  );
});

test("rejects mutable adapters", () => {
  const packet = parsePaymentAdapterPacket(packetFixture());
  const mutable = { ...adapter(packet) };

  assert.throws(
    () => createPaymentAdapterRegistry([packet], [mutable]),
    /payment_adapter_registry_invalid/,
  );
});

test("rejects mutable and proxied executable adapter members", () => {
  const packet = parsePaymentAdapterPacket(packetFixture());
  const valid = adapter(packet);
  const mutableQuery = async () => Object.freeze({
    kind: "pending" as const,
    providerReference: null,
  });
  const mutableCallable = Object.freeze({ ...valid, query: mutableQuery });
  assert.throws(
    () => createPaymentAdapterRegistry([packet], [mutableCallable]),
    /payment_adapter_registry_invalid/,
  );

  const target = Object.freeze(async () => Object.freeze({
    kind: "pending" as const,
    providerReference: null,
  }));
  const proxiedQuery = new Proxy(target, {});
  const proxiedCallable = Object.freeze({ ...valid, query: proxiedQuery });
  assert.throws(
    () => createPaymentAdapterRegistry([packet], [proxiedCallable]),
    /payment_adapter_registry_invalid/,
  );
});

test("rejects adapter packet identity and adapter-version mismatch", () => {
  const packetV1 = parsePaymentAdapterPacket(packetFixture(1));
  const anotherPacketV1 = parsePaymentAdapterPacket(packetFixture(1));
  const packetV2 = parsePaymentAdapterPacket(packetFixture(2));

  assert.throws(
    () => createPaymentAdapterRegistry([packetV1], [adapter(anotherPacketV1)]),
    /payment_adapter_registry_invalid/,
  );
  assert.throws(
    () => createPaymentAdapterRegistry([packetV1], [adapter(packetV2)]),
    /payment_adapter_registry_invalid/,
  );
});

test("rejects packets or adapters missing their explicit registry counterpart", () => {
  const packet = parsePaymentAdapterPacket(packetFixture());
  const selected = adapter(packet);

  assert.throws(
    () => createPaymentAdapterRegistry([packet], []),
    /payment_adapter_registry_invalid/,
  );
  assert.throws(
    () => createPaymentAdapterRegistry([], [selected]),
    /payment_adapter_registry_invalid/,
  );
});

test("rejects inventory_only metadata as an executable packet registry", () => {
  assert.throws(
    () => createPaymentAdapterRegistry(
      PAYMENT_ADAPTER_PACKET_INVENTORY as unknown as readonly PaymentAdapterPacket[],
      [],
    ),
    /payment_adapter_registry_invalid/,
  );
});
