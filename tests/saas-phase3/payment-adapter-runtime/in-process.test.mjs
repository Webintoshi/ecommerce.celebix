import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CHILD = process.env.CELEBIX_PAYMENT_IN_PROCESS_CHILD === "1";

if (!CHILD) {
  test("payment adapter runtime cross-layer acceptance runs under the server-only condition", () => {
    const childEnvironment = {
      ...process.env,
      CELEBIX_PAYMENT_IN_PROCESS_CHILD: "1",
    };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--conditions=react-server",
      "--experimental-transform-types",
      "--test",
      fileURLToPath(import.meta.url),
    ], {
      encoding: "utf8",
      env: childEnvironment,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(
      result.status,
      0,
      `${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  });
} else {
  const {
    IYZICO_IFRAME_PACKET,
    PAYTR_IFRAME_PACKET,
    createIyzicoCheckoutFormAdapter,
    createIyzicoInitializeResponseSignature,
    createIyzicoRetrieveResponseSignature,
    createPaymentAdapterRegistry,
    createPaytrIframeAdapter,
  } = await import("@celebix/payment-adapters");
  const {
    PaymentAttemptRepositoryError,
    sealMerchantProviderCredential,
  } = await import("@celebix/saas-data");
  const {
    createDefaultCustomerPanelPaymentProviderRegistry,
    createDefaultHostedPaymentAdapterRegistry,
  } = await import("../../../apps/customer-panel/lib/payment-provider-adapters/default.ts");
  const {
    createProviderExecutionHttpHandlers,
  } = await import("../../../apps/customer-panel/lib/provider-execution-http/handler.ts");
  const {
    PAYMENT_PROVIDER_CATALOG,
  } = await import("../../../apps/customer-panel/lib/payment-providers/catalog.ts");
  const {
    resolveMerchantProviderProductionMode,
  } = await import("../../../apps/owner/lib/merchant-provider-execution/production-config.ts");
  const {
    createMerchantProviderAdapterRegistry,
  } = await import("../../../apps/owner/lib/merchant-provider-execution/registry.ts");
  const {
    createMerchantProviderWorker,
  } = await import("../../../apps/owner/lib/merchant-provider-execution/worker.ts");
  const {
    createDefaultHostedPaymentRuntime,
  } = await import("../../../apps/storefront-shared/lib/payment-adapters/default.ts");
  const {
    createHostedPaymentCallbackRoute,
    createHostedPaymentRuntime,
  } = await import("../../../apps/storefront-shared/lib/payment-adapters/runtime.ts");

  const STORE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const STORE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const METHOD = "22222222-2222-4222-8222-222222222222";
  const PROFILE = "33333333-3333-4333-8333-333333333333";
  const ATTEMPT = "11111111-1111-4111-8111-111111111111";
  const BINDING = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc";
  const CALLBACK_DIGEST = "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0";
  const TOKEN = "28cc613c3d7633cfa4ed0956fdf901e05cf9d9cc0c2ef8db54fa";
  const AUTHORITY = Object.freeze({
    environment: "test",
    adapterVersion: 1,
    evidenceDigest: `sha256:${"a".repeat(64)}`,
  });
  const KEYRING = Object.freeze({
    activeKeyId: "provider.current",
    keys: Object.freeze([
      Object.freeze({
        keyId: "provider.current",
        key: new Uint8Array(32).fill(0x41),
      }),
    ]),
  });
  const SEALED = (() => {
    const plaintext = new TextEncoder().encode(JSON.stringify({
      merchantKey: "test-merchant-key",
      merchantSalt: "test-merchant-salt",
    }));
    try {
      return sealMerchantProviderCredential({
        plaintext,
        profileId: PROFILE,
        storeId: STORE_A,
        providerCode: "paytr_iframe",
        capability: "payment_processing",
        credentialVersion: 1,
        keyring: KEYRING,
      });
    } finally {
      plaintext.fill(0);
    }
  })();
  const EXPECTED_INITIALIZE_BODY = "merchant_id=123456&user_ip=8.8.8.8&merchant_oid=4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0&email=ada%40example.com&payment_amount=10000&paytr_token=MlwYy6rJ%2FsZOITp%2FeIHzwkPLZoJCwSQW4twPHmxK0gQ%3D&user_basket=W1siw5ZybmVrIMO8csO8biIsIjEwMC4wMCIsMV1d&debug_on=0&no_installment=0&max_installment=0&user_name=Ada+Lovelace&user_address=%C3%96rnek+1+%C4%B0stanbul&user_phone=%2B905551112233&merchant_ok_url=https%3A%2F%2Fpilot.saas-staging.celebix.site%2Fodeme%2Fhizli%2Fsonuc%3Fdurum%3Dbasarili&merchant_fail_url=https%3A%2F%2Fpilot.saas-staging.celebix.site%2Fodeme%2Fhizli%2Fsonuc%3Fdurum%3Dbasarisiz&timeout_limit=30&currency=TL&test_mode=1";
  const SIGNED_CALLBACK = `merchant_oid=${CALLBACK_DIGEST}&status=success&total_amount=10000&hash=Dea8%2B%2BoKQcs6TlVm%2Fy5iF1RQas2QZIkZ1quzDlUnvzM%3D&payment_type=card&test_mode=1&payment_amount=10000&currency=TL`;

  function input(storeId = STORE_A) {
    return {
      headers: new Headers(),
      storeId,
      operationId: ATTEMPT,
      paymentMethodId: METHOD,
      orderReference: "merchant-order-123",
      amountMinor: 10_000,
      currency: "TRY",
      customer: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+905551112233",
        ipAddress: "8.8.8.8",
        address: "Örnek 1 İstanbul",
        identityNumber: "74300864791",
        city: "İstanbul",
        country: "Türkiye",
        postalCode: "34000",
      },
      basket: [{
        reference: "SKU-1",
        name: "Örnek ürün",
        quantity: 1,
        unitAmountMinor: 10_000,
        itemType: "PHYSICAL",
      }],
    };
  }

  function repository() {
    let version = 0;
    let status = "none";
    let providerReference = null;
    let callbackBindingDigest = null;
    let settlementCalls = 0;
    let createdAttempts = 0;
    const authority = () => ({
      attemptId: ATTEMPT,
      storeId: STORE_A,
      paymentMethodId: METHOD,
      profileId: PROFILE,
      providerCode: "paytr_iframe",
      environment: "test",
      executionAdapterVersion: AUTHORITY.adapterVersion,
      executionEvidenceDigest: AUTHORITY.evidenceDigest,
      credentialVersion: 1,
      orderReference: "merchant-order-123",
      amountMinor: 10_000,
      currency: "TRY",
      status,
      version,
      providerReference,
      publicConfig: { environment: "test", merchantId: "123456" },
      sealedCredentials: SEALED,
    });
    return {
      get settlementCalls() { return settlementCalls; },
      get createdAttempts() { return createdAttempts; },
      get status() { return status; },
      async begin(selected) {
        if (selected.authority.storeId !== STORE_A || selected.paymentMethodId !== METHOD) {
          throw new PaymentAttemptRepositoryError("not_found");
        }
        createdAttempts += 1;
        callbackBindingDigest = selected.callbackBindingDigest;
        version = 1;
        status = "created";
        return {
          outcome: "created",
          attemptId: ATTEMPT,
          storeId: STORE_A,
          paymentMethodId: METHOD,
          profileId: PROFILE,
          providerCode: "paytr_iframe",
          environment: "test",
          executionAdapterVersion: AUTHORITY.adapterVersion,
          executionEvidenceDigest: AUTHORITY.evidenceDigest,
          credentialVersion: 1,
          amountMinor: 10_000,
          currency: "TRY",
          publicConfig: { environment: "test", merchantId: "123456" },
          sealedCredentials: SEALED,
        };
      },
      async markInitialized(selected) {
        version = 2;
        status = selected.status;
        providerReference = selected.providerReference;
        return {
          attemptId: ATTEMPT,
          status,
          version,
          providerReference,
          safeCode: selected.safeCode,
          replayed: false,
        };
      },
      async markUnknown() {
        throw new Error("unexpected_unknown");
      },
      async getCallbackAuthority(selected) {
        if (selected.callbackBindingDigest !== callbackBindingDigest) {
          throw new PaymentAttemptRepositoryError("not_found");
        }
        return authority();
      },
      async getReconciliationAuthority() {
        throw new Error("unexpected_reconciliation");
      },
      async settleCallback(selected) {
        throw new Error(`legacy_settlement_must_not_run:${selected.status}`);
      },
      async applyHostedCallback(selected) {
        settlementCalls += 1;
        const replayed = status === "captured";
        if (!replayed) {
          status = selected.status;
          providerReference = selected.providerReference;
          version += (status === "captured" || status === "failed") && version === 2 ? 2 : 1;
        }
        return {
          attemptId: ATTEMPT,
          status,
          version,
          providerReference,
          safeCode: selected.safeCode,
          replayed,
          disposition: replayed ? "replayed" : "applied",
        };
      },
      async claimReconciliation() {
        throw new Error("unexpected_reconciliation");
      },
      async finalizeReconciliation() {
        throw new Error("unexpected_reconciliation");
      },
    };
  }

  test("store A completes the official PayTR vector through generic iframe and signed callback while return and store B stay powerless", async () => {
    const attempts = repository();
    let providerCalls = 0;
    const transport = Object.freeze({
      request: Object.freeze(async (request) => {
        providerCalls += 1;
        const body = new TextDecoder().decode(request.body);
        assert.equal(request.url, "https://www.paytr.com/odeme/api/get-token");
        assert.equal(body, EXPECTED_INITIALIZE_BODY);
        return {
          kind: "response",
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: new TextEncoder().encode(JSON.stringify({ status: "success", token: TOKEN })),
        };
      }),
    });
    const adapter = createPaytrIframeAdapter(transport);
    const runtime = createHostedPaymentRuntime({
      attempts,
      adapters: createPaymentAdapterRegistry([PAYTR_IFRAME_PACKET], [adapter]),
      keyring: KEYRING,
      selectAuthority: () => ({
        kind: "trusted",
        hostname: "pilot.saas-staging.celebix.site",
      }),
      selectCompiledAuthority: (providerCode) => providerCode === "paytr_iframe"
        ? Object.freeze({ providerCode, ...AUTHORITY })
        : null,
      matchesCompiledAuthority: async (authority) => {
        assert.deepEqual(authority, {
          providerCode: "paytr_iframe",
          capability: "payment_processing",
          ...AUTHORITY,
        });
        return true;
      },
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      randomBytes: (size) => new Uint8Array(size).fill(7),
    });

    assert.deepEqual(await runtime.initialize(input()), {
      kind: "iframe",
      url: `https://www.paytr.com/odeme/guvenli/${TOKEN}`,
      token: TOKEN,
    });
    assert.equal(providerCalls, 1);
    assert.equal(attempts.createdAttempts, 1);

    const returnResult = await runtime.callback({
      request: new Request("https://pilot.saas-staging.celebix.site/odeme/hizli/sonuc?durum=basarili"),
      providerCode: "paytr_iframe",
      binding: BINDING,
    });
    assert.deepEqual(returnResult, { kind: "rejected" });
    assert.equal(attempts.settlementCalls, 0);

    assert.deepEqual(await runtime.callback({
      request: new Request(
        `https://pilot.saas-staging.celebix.site/api/payments/paytr_iframe/callback/${BINDING}`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: SIGNED_CALLBACK,
        },
      ),
      providerCode: "paytr_iframe",
      binding: BINDING,
    }), { kind: "accepted" });
    assert.equal(attempts.status, "captured");
    assert.equal(attempts.settlementCalls, 1);

    assert.deepEqual(await runtime.callback({
      request: new Request(
        `https://pilot.saas-staging.celebix.site/api/payments/paytr_iframe/callback/${BINDING}`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: SIGNED_CALLBACK,
        },
      ),
      providerCode: "paytr_iframe",
      binding: BINDING,
    }), { kind: "accepted" });
    assert.equal(attempts.status, "captured");
    assert.equal(attempts.settlementCalls, 2);

    assert.deepEqual(await runtime.initialize(input(STORE_B)), { kind: "rejected" });
    assert.equal(attempts.createdAttempts, 1);
    assert.equal(providerCalls, 1);
  });

  test("iyzico exact compiled authority initializes with real buyer fields and no durable PII", async () => {
    const iyzicoToken = "A234567890123456789012345678901234567";
    const iyzicoCredential = Object.freeze({
      apiKey: "sandbox-api-key",
      secretKey: "sandbox-secret-key",
    });
    const sealed = (() => {
      const plaintext = new TextEncoder().encode(JSON.stringify(iyzicoCredential));
      try {
        return sealMerchantProviderCredential({
          plaintext,
          profileId: PROFILE,
          storeId: STORE_A,
          providerCode: "iyzico_iframe",
          capability: "payment_processing",
          credentialVersion: 1,
          keyring: KEYRING,
        });
      } finally {
        plaintext.fill(0);
      }
    })();
    let beginInput;
    let initializedInput;
    let providerBody;
    const attempts = Object.freeze({
      async begin(selected) {
        beginInput = selected;
        return {
          outcome: "created",
          attemptId: ATTEMPT,
          storeId: STORE_A,
          paymentMethodId: METHOD,
          profileId: PROFILE,
          providerCode: "iyzico_iframe",
          environment: "test",
          executionAdapterVersion: AUTHORITY.adapterVersion,
          executionEvidenceDigest: AUTHORITY.evidenceDigest,
          credentialVersion: 1,
          amountMinor: 10_000,
          currency: "TRY",
          publicConfig: { environment: "test" },
          sealedCredentials: sealed,
        };
      },
      async markInitialized(selected) {
        initializedInput = selected;
        return {
          attemptId: ATTEMPT,
          status: selected.status,
          version: 2,
          providerReference: selected.providerReference,
          safeCode: selected.safeCode,
          replayed: false,
        };
      },
      async markUnknown() { throw new Error("unexpected_unknown"); },
      async getCallbackAuthority() { throw new Error("unexpected_callback"); },
      async getReconciliationAuthority() { throw new Error("unexpected_reconciliation"); },
      async settleCallback() { throw new Error("unexpected_callback"); },
      async applyHostedCallback() { throw new Error("unexpected_callback"); },
      async claimReconciliation() { throw new Error("unexpected_reconciliation"); },
      async finalizeReconciliation() { throw new Error("unexpected_reconciliation"); },
    });
    const response = {
      status: "success",
      conversationId: ATTEMPT,
      token: iyzicoToken,
      paymentPageUrl: `https://sandbox-cpp.iyzipay.com?token=${iyzicoToken}&lang=tr`,
    };
    const signature = createIyzicoInitializeResponseSignature({
      credential: iyzicoCredential,
      conversationId: response.conversationId,
      token: response.token,
    });
    const adapter = createIyzicoCheckoutFormAdapter(Object.freeze({
      request: Object.freeze(async (selected) => {
        assert.equal(
          selected.url,
          "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom",
        );
        providerBody = JSON.parse(new TextDecoder().decode(selected.body));
        return {
          kind: "response",
          status: 200,
          contentType: "application/json",
          body: new TextEncoder().encode(JSON.stringify({ ...response, signature })),
        };
      }),
    }), Object.freeze({ randomKey: Object.freeze(() => "fixedRandomKey0123456789") }));
    const runtime = createHostedPaymentRuntime({
      attempts,
      adapters: createPaymentAdapterRegistry([IYZICO_IFRAME_PACKET], [adapter]),
      keyring: KEYRING,
      selectAuthority: () => ({
        kind: "trusted",
        hostname: "pilot.saas-staging.celebix.site",
      }),
      selectCompiledAuthority: (providerCode) => providerCode === "iyzico_iframe"
        ? Object.freeze({ providerCode, ...AUTHORITY })
        : null,
      matchesCompiledAuthority: async (authority) => {
        assert.deepEqual(authority, {
          providerCode: "iyzico_iframe",
          capability: "payment_processing",
          ...AUTHORITY,
        });
        return true;
      },
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      randomBytes: (size) => new Uint8Array(size).fill(7),
    });
    const customer = Object.freeze({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+905551112233",
      ipAddress: "8.8.8.8",
      address: "Örnek Mahallesi 1",
      identityNumber: "74300864791",
      city: "İstanbul",
      country: "Türkiye",
      postalCode: "34000",
    });
    const basket = Object.freeze([Object.freeze({
      reference: "SKU-1",
      name: "Örnek ürün",
      quantity: 1,
      unitAmountMinor: 10_000,
      itemType: "PHYSICAL",
    })]);
    assert.deepEqual(await runtime.initialize({ ...input(), customer, basket }), {
      kind: "iframe",
      url: response.paymentPageUrl,
      token: iyzicoToken,
    });
    assert.deepEqual(providerBody.buyer, {
      id: ATTEMPT,
      name: "Ada",
      surname: "Lovelace",
      gsmNumber: "+905551112233",
      email: "ada@example.com",
      identityNumber: "74300864791",
      registrationAddress: "Örnek Mahallesi 1",
      ip: "8.8.8.8",
      city: "İstanbul",
      country: "Türkiye",
      zipCode: "34000",
    });
    assert.equal(providerBody.basketItems[0].itemType, "PHYSICAL");
    assert.equal(initializedInput.safeCode, "iframe_ready");
    const durable = JSON.stringify({ beginInput, initializedInput });
    assert.doesNotMatch(durable, /Ada|Lovelace|74300864791|Mahallesi|Örnek ürün|sandbox-secret-key/);
  });

  test("iyzico signed retrieve settles once and the browser receives only the fixed local result redirect", async () => {
    const iyzicoToken = "A234567890123456789012345678901234567";
    const iyzicoCredential = Object.freeze({
      apiKey: "sandbox-api-key",
      secretKey: "sandbox-secret-key",
    });
    const sealed = (() => {
      const plaintext = new TextEncoder().encode(JSON.stringify(iyzicoCredential));
      try {
        return sealMerchantProviderCredential({
          plaintext,
          profileId: PROFILE,
          storeId: STORE_A,
          providerCode: "iyzico_iframe",
          capability: "payment_processing",
          credentialVersion: 1,
          keyring: KEYRING,
        });
      } finally {
        plaintext.fill(0);
      }
    })();
    let settlements = 0;
    const attempts = Object.freeze({
      async begin() { throw new Error("unexpected_begin"); },
      async markInitialized() { throw new Error("unexpected_initialize"); },
      async markUnknown() { throw new Error("unexpected_unknown"); },
      async getCallbackAuthority(selected) {
        assert.deepEqual(selected, {
          providerCode: "iyzico_iframe",
          callbackBindingDigest: CALLBACK_DIGEST,
          now: new Date("2026-07-27T12:00:00.000Z"),
        });
        return {
          attemptId: ATTEMPT,
          storeId: STORE_A,
          paymentMethodId: METHOD,
          profileId: PROFILE,
          providerCode: "iyzico_iframe",
          environment: "test",
          executionAdapterVersion: AUTHORITY.adapterVersion,
          executionEvidenceDigest: AUTHORITY.evidenceDigest,
          credentialVersion: 1,
          orderReference: "merchant-order-123",
          amountMinor: 10_000,
          currency: "TRY",
          status: "awaiting_customer",
          version: 2,
          providerReference: iyzicoToken,
          publicConfig: { environment: "test" },
          sealedCredentials: sealed,
        };
      },
      async getReconciliationAuthority() { throw new Error("unexpected_reconciliation"); },
      async settleCallback(selected) {
        throw new Error(`legacy_settlement_must_not_run:${selected.status}`);
      },
      async applyHostedCallback(selected) {
        settlements += 1;
        assert.equal(selected.status, "captured");
        assert.equal(selected.providerReference, iyzicoToken);
        assert.equal(selected.amountMinor, 10_000);
        return {
          attemptId: ATTEMPT,
          status: "captured",
          version: 4,
          providerReference: iyzicoToken,
          safeCode: "success",
          replayed: false,
          disposition: "applied",
        };
      },
      async claimReconciliation() { throw new Error("unexpected_reconciliation"); },
      async finalizeReconciliation() { throw new Error("unexpected_reconciliation"); },
    });
    const retrieve = {
      status: "success",
      paymentStatus: "SUCCESS",
      paymentId: "payment-123",
      currency: "TRY",
      basketId: "merchant-order-123",
      conversationId: ATTEMPT,
      paidPrice: "100.00",
      price: "100.00",
      token: iyzicoToken,
      fraudStatus: 1,
    };
    const signature = createIyzicoRetrieveResponseSignature({
      credential: iyzicoCredential,
      paymentStatus: retrieve.paymentStatus,
      paymentId: retrieve.paymentId,
      currency: retrieve.currency,
      basketId: retrieve.basketId,
      conversationId: retrieve.conversationId,
      paidPrice: retrieve.paidPrice,
      price: retrieve.price,
      token: retrieve.token,
    });
    let retrieveCalls = 0;
    const adapter = createIyzicoCheckoutFormAdapter(Object.freeze({
      request: Object.freeze(async (selected) => {
        retrieveCalls += 1;
        assert.equal(
          selected.url,
          "https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/auth/ecom/detail",
        );
        return {
          kind: "response",
          status: 200,
          contentType: "application/json",
          body: new TextEncoder().encode(JSON.stringify({ ...retrieve, signature })),
        };
      }),
    }), Object.freeze({ randomKey: Object.freeze(() => "fixedRandomKey0123456789") }));
    const runtime = createHostedPaymentRuntime({
      attempts,
      adapters: createPaymentAdapterRegistry([IYZICO_IFRAME_PACKET], [adapter]),
      keyring: KEYRING,
      selectAuthority: () => ({
        kind: "trusted",
        hostname: "pilot.saas-staging.celebix.site",
      }),
      selectCompiledAuthority: (providerCode) => providerCode === "iyzico_iframe"
        ? Object.freeze({ providerCode, ...AUTHORITY })
        : null,
      matchesCompiledAuthority: async (authority) => {
        assert.deepEqual(authority, {
          providerCode: "iyzico_iframe",
          capability: "payment_processing",
          ...AUTHORITY,
        });
        return true;
      },
      now: () => new Date("2026-07-27T12:00:00.000Z"),
      randomBytes: (size) => new Uint8Array(size).fill(7),
    });
    const route = createHostedPaymentCallbackRoute({ resolveRuntime: async () => runtime });
    const response = await route(new Request(
      `https://pilot.saas-staging.celebix.site/api/payments/iyzico_iframe/callback/${BINDING}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://sandbox-cpp.iyzipay.com",
        },
        body: `token=${iyzicoToken}`,
      },
    ), {
      params: Promise.resolve({ providerCode: "iyzico_iframe", binding: BINDING }),
    });

    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/odeme/hizli/sonuc?durum=basarili");
    assert.equal(await response.text(), "");
    assert.equal(retrieveCalls, 1);
    assert.equal(settlements, 1);
  });

  test("absent stale superseded and revoked authority remain inert at panel owner and storefront boundaries on replay", async () => {
    const states = [
      ["absent", null],
      ["stale", { ...AUTHORITY, evidenceDigest: `sha256:${"b".repeat(64)}` }],
      ["superseded", { ...AUTHORITY, adapterVersion: 2 }],
      ["revoked", null],
    ];
    for (const [state, compiledAuthority] of states) {
      let profileSaves = 0;
      let validationClaims = 0;
      let validationMarks = 0;
      let validationNetwork = 0;
      let storefrontDependencyReads = 0;
      const transport = Object.freeze({
        request: Object.freeze(async () => {
          validationNetwork += 1;
          throw new Error("provider_network_must_not_run");
        }),
      });
      const hosted = createDefaultHostedPaymentAdapterRegistry(transport);
      let panel;
      try {
        panel = createDefaultCustomerPanelPaymentProviderRegistry(
          hosted,
          compiledAuthority,
          "approved_test_sandbox",
        );
      } catch {
        panel = createDefaultCustomerPanelPaymentProviderRegistry(
          hosted,
          null,
          "approved_test_sandbox",
        );
      }
      assert.equal(
        panel.get("paytr_iframe", "payment_processing")?.executionAuthority,
        null,
      );
      const tenantContext = {
        schemaVersion: 1,
        requestId: "private",
        principal: {
          id: "10000000-0000-4000-8000-000000000001",
          issuer: "https://id.test/oidc",
          subject: "private",
        },
        store: {
          id: STORE_A,
          slug: "store-a",
          status: "active",
        },
        membership: {
          id: "30000000-0000-4000-8000-000000000001",
          role: "store_owner",
          status: "active",
        },
        plan: {
          id: "40000000-0000-4000-8000-000000000001",
          code: "pro",
          version: 1,
          features: ["integrations.manage"],
          limits: {},
        },
      };
      const profiles = {
        async list() { return []; },
        async save() { profileSaves += 1; throw new Error("profile_save_must_not_run"); },
        async disable() { throw new Error("unused"); },
        async revoke() { throw new Error("unused"); },
      };
      const handlers = createProviderExecutionHttpHandlers({
        async resolveRuntime() {
          return {
            access: {
              readiness: { mode: "approved_staging" },
              panelOrigin: "https://panel.staging.example",
              async resolveCredential() {
                return { kind: "authenticated", tenantContext };
              },
            },
            profiles,
            keyring: KEYRING,
            registry: panel,
            adapters: hosted,
          };
        },
        now: () => new Date("2026-07-27T12:00:00.000Z"),
        requestId: () => "71000000-0000-4000-8000-000000000001",
        profileId: () => PROFILE,
        providerCodes: () => ["paytr_iframe"],
        paymentCatalog: () => PAYMENT_PROVIDER_CATALOG,
      });
      for (let replay = 0; replay < 2; replay += 1) {
        const response = await handlers.profiles(new Request(
          "https://panel.staging.example/api/merchant-providers/profiles",
          {
            method: "POST",
            headers: {
              cookie: "__Host-celebix_panel=v1.panel.current.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
              origin: "https://panel.staging.example",
              "content-type": "application/json",
              "idempotency-key": "70000000-0000-4000-8000-000000000001",
            },
            body: JSON.stringify({
              providerCode: "paytr_iframe",
              capability: "payment_processing",
              publicConfig: { environment: "test", merchantId: "123456" },
              credential: {
                merchantKey: "must-not-parse",
                merchantSalt: "must-not-parse",
              },
              expectedVersion: 0,
            }),
          },
        ));
        assert.equal(response.status, 503, state);
      }
      assert.equal(profileSaves, 0, state);

      const ownerMode = resolveMerchantProviderProductionMode({
        CELEBIX_MERCHANT_PROVIDER_WORKER_MODE: "approved_test_validation",
        CELEBIX_PAYTR_EXECUTION_EVIDENCE_DIGEST: AUTHORITY.evidenceDigest,
      });
      assert.equal(ownerMode, "approved_test_validation", state);
      if (compiledAuthority !== null) {
        const adapter = Object.freeze({
          providerCode: "paytr_iframe",
          capability: "payment_processing",
          executionAuthority: Object.freeze(compiledAuthority),
          async validateCredential() {
            validationNetwork += 1;
            return { kind: "validated" };
          },
          async execute() { throw new Error("unused"); },
          async reconcile() { throw new Error("unused"); },
        });
        const repository = {
          async claimProfileVerification() { throw new Error("verification_registry_empty"); },
          async markProfileVerification() { throw new Error("verification_registry_empty"); },
          async claimProfileValidation() {
            validationClaims += 1;
            return { kind: "empty" };
          },
          async markProfileValidation() {
            validationMarks += 1;
            throw new Error("validation_mark_must_not_run");
          },
          async claim() { return { kind: "empty" }; },
          async heartbeat() { throw new Error("unused"); },
          async finalize() { throw new Error("unused"); },
          async reconcile() { throw new Error("unused"); },
          async recover() { throw new Error("unused"); },
        };
        const worker = createMerchantProviderWorker({
          mode: "validation_only",
          repository,
          registry: createMerchantProviderAdapterRegistry([adapter]),
          verificationRegistry: Object.freeze({
            size: 0,
            get: Object.freeze(() => null),
            list: Object.freeze(() => Object.freeze([])),
          }),
          keyring: KEYRING,
          workerId: "owner.payments.test",
          now: () => new Date("2026-07-27T12:00:00.000Z"),
          leaseDurationMs: 60_000,
          audit: () => undefined,
        });
        assert.deepEqual(await worker.runOnce(), { kind: "empty" });
        assert.deepEqual(await worker.runOnce(), { kind: "empty" });
        assert.equal(validationClaims, 2, state);
      } else {
        assert.equal(validationClaims, 0, state);
      }
      assert.equal(validationMarks, 0, state);
      assert.equal(validationNetwork, 0, state);

      const dependencies = Object.defineProperties({}, {
        attempts: { enumerable: true, get() { storefrontDependencyReads += 1; return {}; } },
        keyring: { enumerable: true, get() { storefrontDependencyReads += 1; return {}; } },
        transport: { enumerable: true, get() { storefrontDependencyReads += 1; return transport; } },
        selectAuthority: { enumerable: true, get() { storefrontDependencyReads += 1; return () => ({ kind: "trusted" }); } },
        now: { enumerable: true, get() { storefrontDependencyReads += 1; return () => new Date(); } },
        randomBytes: { enumerable: true, get() { storefrontDependencyReads += 1; return () => new Uint8Array(32); } },
      });
      for (let replay = 0; replay < 2; replay += 1) {
        assert.equal(createDefaultHostedPaymentRuntime({
          source: {
            CELEBIX_PAYTR_IFRAME_STOREFRONT_MODE: "approved_test_sandbox",
          },
          compiledAuthorities: Object.freeze({
            paytr_iframe: compiledAuthority,
            iyzico_iframe: null,
          }),
          dependencies,
        }), null, state);
      }
      assert.equal(storefrontDependencyReads, 0, state);
    }
  });
}
