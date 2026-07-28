import assert from "node:assert/strict";
import test from "node:test";

import type { MerchantAdminJson, TenantContext } from "@celebix/saas-contracts";

import {
  PAYMENT_METHOD_ERROR_CODES,
  PaymentMethodRepositoryError,
  PostgresPaymentMethodRepository,
  type PaymentMethodRepository,
} from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const METHOD = "51000000-0000-4000-8000-000000000001";
const PROFILE = "52000000-0000-4000-8000-000000000001";
const OPERATION = "53000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-27T12:00:00.000Z");

function tenant(overrides: Record<string, unknown> = {}): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "request-payment-method",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "merchant" },
    store: { id: STORE, slug: "payment-store", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["catalog"],
      limits: { products: 100, staff: 5, storageBytes: 1024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
    ...overrides,
  } as TenantContext;
}

function method() {
  return {
    id: METHOD,
    kind: "provider",
    profileId: PROFILE,
    providerCode: "paytr_iframe",
    label: "PayTR",
    state: "disabled",
    emergencyReason: null,
    position: 0,
    config: { checkoutLabel: "Kart ile ödeme" },
    version: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function mutation(replayed = false, state = "disabled", version = 1) {
  return {
    id: METHOD,
    state,
    position: 0,
    version,
    updatedAt: NOW.toISOString(),
    replayed,
  };
}

function reordered(replayed = false) {
  return { items: [mutation(replayed, "disabled", 2)], replayed };
}

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  readonly responder: Responder;
  constructor(responder: Responder = () => []) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}

class Pool {
  private index = 0;
  readonly clients: Client[];
  constructor(clients: Client[]) { this.clients = clients; }
  async connect() {
    const selected = this.clients[this.index++];
    if (!selected) throw new Error("checkout");
    return selected;
  }
}

function repository(pool: Pool, audit: string[] = []): PaymentMethodRepository {
  return new PostgresPaymentMethodRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit(event) { audit.push(event.type); },
  });
}

function authority() { return { tenantContext: tenant(), now: NOW }; }

function saveInput(config: Readonly<Record<string, MerchantAdminJson>> = { checkoutLabel: "Kart ile ödeme" }) {
  return {
    ...authority(),
    operationId: OPERATION,
    methodId: METHOD,
    expectedVersion: 0,
    kind: "provider" as const,
    profileId: PROFILE,
    providerCode: "paytr_iframe",
    label: "PayTR",
    config,
  };
}

function call(client: Client, functionName: string) {
  const selected = client.calls.filter((entry) => entry.text.includes(`saas.${functionName}`));
  assert.equal(selected.length, 1);
  return selected[0]!;
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof PaymentMethodRepositoryError && error.code === code && error.message === code;
}

test("payment method repository sends authority only from TenantContext and parses safe frozen list", async () => {
  const client = new Client((text) => text.includes("payment_method_list")
    ? [{ outcome: "listed", result_payload: { items: [method()] } }]
    : []);
  const result = await repository(new Pool([client])).list(authority());
  assert.equal(result.length, 1);
  assert.equal(result[0]?.providerCode, "paytr_iframe");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);
  const selected = call(client, "payment_method_list");
  assert.equal(selected.text, "SELECT outcome,result_payload FROM saas.payment_method_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)");
  assert.deepEqual(selected.values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
  assert.doesNotMatch(JSON.stringify(result), /storeId|principalId|membershipId/);
});

test("save uses exact SQL order and a canonical store-bound fingerprint", async () => {
  const clients = [
    new Client((text) => text.includes("payment_method_save") ? [{ outcome: "saved", result_payload: mutation() }] : []),
    new Client((text) => text.includes("payment_method_save") ? [{ outcome: "saved", result_payload: mutation() }] : []),
  ];
  const repo = repository(new Pool(clients));
  await repo.save(saveInput({ zeta: 2, alpha: 1 }));
  await repo.save(saveInput({ alpha: 1, zeta: 2 }));
  for (const client of clients) {
    const selected = call(client, "payment_method_save");
    assert.equal(selected.text, "SELECT outcome,result_payload FROM saas.payment_method_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text,$13::uuid,$14::text,$15::text,$16::jsonb)");
    assert.deepEqual(selected.values.slice(0, 8), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, OPERATION]);
    assert.match(String(selected.values[8]), /^[a-f0-9]{64}$/);
    assert.deepEqual(selected.values.slice(9, 16), [METHOD, 0, "provider", PROFILE, "paytr_iframe", "PayTR", JSON.stringify({ alpha: 1, zeta: 2 })]);
  }
  assert.equal(clients[0]!.calls.find((entry) => entry.text.includes("payment_method_save"))!.values[8], clients[1]!.calls.find((entry) => entry.text.includes("payment_method_save"))!.values[8]);
});

test("state and reorder use exact bounded payloads and result parsers", async () => {
  const stateClient = new Client((text) => text.includes("payment_method_set_state")
    ? [{ outcome: "state_changed", result_payload: mutation(false, "emergency_disabled", 2) }]
    : []);
  const stateResult = await repository(new Pool([stateClient])).setState({
    ...authority(), operationId: OPERATION, methodId: METHOD, expectedVersion: 1,
    state: "emergency_disabled", emergencyReason: "Sağlayıcı kesintisi doğrulandı",
  });
  assert.equal(stateResult.state, "emergency_disabled");
  assert.deepEqual(call(stateClient, "payment_method_set_state").values.slice(9), [METHOD, 1, "emergency_disabled", "Sağlayıcı kesintisi doğrulandı"]);

  const reorderClient = new Client((text) => text.includes("payment_method_reorder")
    ? [{ outcome: "reordered", result_payload: reordered() }]
    : []);
  const items = [{ id: METHOD, expectedVersion: 1, position: 0 }] as const;
  const reorderResult = await repository(new Pool([reorderClient])).reorder({ ...authority(), operationId: OPERATION, items });
  assert.deepEqual(reorderResult, reordered());
  assert.equal(call(reorderClient, "payment_method_reorder").values[9], JSON.stringify(items));
});

test("all mutation kinds recover exactly once after an unknown COMMIT and never repeat the write", async () => {
  const cases = [
    {
      functionName: "payment_method_save",
      outcome: "saved",
      written: mutation(),
      recovered: mutation(true),
      invoke: (repo: PaymentMethodRepository) => repo.save(saveInput()),
    },
    {
      functionName: "payment_method_set_state",
      outcome: "state_changed",
      written: mutation(false, "active", 2),
      recovered: mutation(true, "active", 2),
      invoke: (repo: PaymentMethodRepository) => repo.setState({
        ...authority(), operationId: OPERATION, methodId: METHOD, expectedVersion: 1,
        state: "active", emergencyReason: null,
      }),
    },
    {
      functionName: "payment_method_reorder",
      outcome: "reordered",
      written: reordered(),
      recovered: reordered(true),
      invoke: (repo: PaymentMethodRepository) => repo.reorder({
        ...authority(), operationId: OPERATION,
        items: [{ id: METHOD, expectedVersion: 1, position: 0 }],
      }),
    },
  ] as const;
  for (const selected of cases) {
    const writer = new Client((text) => {
      if (text.includes(selected.functionName)) return [{ outcome: selected.outcome, result_payload: selected.written }];
      if (text === "COMMIT") throw new Error("wire");
      return [];
    });
    const recovery = new Client((text) => text.includes("payment_method_recover_operation")
      ? [{ outcome: "operation_replayed", result_payload: selected.recovered }]
      : []);
    const audit: string[] = [];
    const result = await selected.invoke(repository(new Pool([writer, recovery]), audit));
    assert.equal(result.replayed, true);
    assert.deepEqual(writer.releases, [true]);
    assert.deepEqual(audit, ["payment_method_commit_unknown"]);
    assert.equal(writer.calls.filter((entry) => entry.text.includes(selected.functionName)).length, 1);
    assert.equal(recovery.calls.filter((entry) => entry.text.includes("payment_method_recover_operation")).length, 1);
    assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  }
});

test("durable method_already_exists commits its operation marker before surfacing the finite error", async () => {
  const writer = new Client((text) => text.includes("payment_method_save")
    ? [{ outcome: "method_already_exists", result_payload: null }]
    : []);

  await assert.rejects(
    () => repository(new Pool([writer])).save(saveInput()),
    errorCode("method_already_exists"),
  );

  assert.equal(writer.calls.filter(({ text }) => text === "COMMIT").length, 1);
  assert.equal(writer.calls.filter(({ text }) => text === "ROLLBACK").length, 0);
  assert.deepEqual(writer.releases, [undefined]);
});

test("unknown duplicate-marker COMMIT recovers the exact durable reason without repeating the save", async () => {
  const writer = new Client((text) => {
    if (text.includes("payment_method_save")) {
      return [{ outcome: "method_already_exists", result_payload: null }];
    }
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("payment_method_recover_operation")
    ? [{
      outcome: "operation_replayed",
      result_payload: { outcome: "method_already_exists", replayed: true },
    }]
    : []);
  const audit: string[] = [];

  await assert.rejects(
    () => repository(new Pool([writer, recovery]), audit).save(saveInput()),
    errorCode("method_already_exists"),
  );

  assert.deepEqual(audit, ["payment_method_commit_unknown"]);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(writer.calls.filter(({ text }) => text.includes("payment_method_save")).length, 1);
  assert.equal(writer.calls.filter(({ text }) => text === "ROLLBACK").length, 0);
  assert.equal(recovery.calls.filter(({ text }) => text.includes("payment_method_recover_operation")).length, 1);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
});

test("unknown duplicate-marker COMMIT fails closed when recovery returns a different marker", async () => {
  const writer = new Client((text) => {
    if (text.includes("payment_method_save")) {
      return [{ outcome: "method_already_exists", result_payload: null }];
    }
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("payment_method_recover_operation")
    ? [{
      outcome: "operation_replayed",
      result_payload: { outcome: "version_conflict", replayed: true },
    }]
    : []);

  await assert.rejects(
    () => repository(new Pool([writer, recovery])).save(saveInput()),
    errorCode("unavailable"),
  );
  assert.equal(writer.calls.filter(({ text }) => text.includes("payment_method_save")).length, 1);
  assert.equal(recovery.calls.filter(({ text }) => text.includes("payment_method_recover_operation")).length, 1);
});

test("explicit recovery is read-only and returns only a validated operation projection", async () => {
  const client = new Client((text) => text.includes("payment_method_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: reordered(true) }]
    : []);
  const result = await repository(new Pool([client])).recoverOperation({
    ...authority(), operationId: OPERATION, fingerprint: "a".repeat(64),
  });
  assert.equal("items" in result, true);
  assert.deepEqual(call(client, "payment_method_recover_operation").values.slice(-2), [OPERATION, "a".repeat(64)]);
});

test("commit recovery rejects a projection different from the observed write", async () => {
  const writer = new Client((text) => {
    if (text.includes("payment_method_save")) return [{ outcome: "saved", result_payload: mutation() }];
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("payment_method_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: { ...mutation(true), position: 9 } }]
    : []);
  await assert.rejects(() => repository(new Pool([writer, recovery])).save(saveInput()), errorCode("unavailable"));
  assert.equal(writer.calls.filter((entry) => entry.text.includes("payment_method_save")).length, 1);
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("payment_method_recover_operation")).length, 1);
});

test("repository exposes exactly the closed safe error union and maps unknown outcomes to unavailable", async () => {
  assert.deepEqual(PAYMENT_METHOD_ERROR_CODES, [
    "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
    "feature_not_enabled", "profile_not_found", "profile_not_active",
    "provider_capability_mismatch", "record_not_found", "invalid_transition",
    "version_conflict", "provider_already_active", "method_already_exists", "operation_mismatch", "operation_not_found",
    "durable_authority_invalid", "unavailable",
  ]);
  for (const code of PAYMENT_METHOD_ERROR_CODES.filter((entry) => entry !== "unavailable")) {
    const client = new Client((text) => text.includes("payment_method_save")
      ? [{ outcome: code, result_payload: null }]
      : []);
    await assert.rejects(() => repository(new Pool([client])).save(saveInput()), errorCode(code));
  }
  const unknown = new Client((text) => text.includes("payment_method_save")
    ? [{ outcome: "private_database_detail", result_payload: null }]
    : []);
  await assert.rejects(() => repository(new Pool([unknown])).save(saveInput()), errorCode("unavailable"));
});

test("hostile inputs and corrupt projections fail closed before authority can escape", async () => {
  const repo = repository(new Pool([]));
  await assert.rejects(() => repo.save({ ...saveInput(), storeId: STORE } as never), errorCode("invalid_input"));
  await assert.rejects(() => repo.save({ ...saveInput(), config: { apiSecret: "forbidden" } }), errorCode("invalid_input"));
  await assert.rejects(() => repo.save({ ...saveInput(), kind: "bank_transfer", profileId: PROFILE } as never), errorCode("invalid_input"));
  await assert.rejects(() => repo.setState({
    ...authority(), operationId: OPERATION, methodId: METHOD, expectedVersion: 1,
    state: "emergency_disabled", emergencyReason: null,
  }), errorCode("invalid_input"));
  await assert.rejects(() => repo.reorder({
    ...authority(), operationId: OPERATION,
    items: [{ id: METHOD, expectedVersion: 1, position: 0 }, { id: METHOD, expectedVersion: 1, position: 1 }],
  }), errorCode("invalid_input"));
  await assert.rejects(() => repo.list({ ...authority(), tenantContext: tenant({ store: { id: "attacker", slug: "x", status: "active" } }) }), errorCode("durable_authority_invalid"));
  let getterInvoked = false;
  const getterInput = Object.defineProperty({ ...saveInput() }, "label", {
    enumerable: true,
    get() { getterInvoked = true; return "PayTR"; },
  });
  await assert.rejects(() => repo.save(getterInput), errorCode("invalid_input"));
  assert.equal(getterInvoked, false);
  const hostileProxy = new Proxy(saveInput(), { getPrototypeOf() { throw new Error("trap"); } });
  await assert.rejects(() => repo.save(hostileProxy), errorCode("invalid_input"));

  const corrupt = new Client((text) => text.includes("payment_method_list")
    ? [{ outcome: "listed", result_payload: { items: [{ ...method(), credential: "private" }] } }]
    : []);
  await assert.rejects(() => repository(new Pool([corrupt])).list(authority()), errorCode("unavailable"));
});

test("list descriptor-copies an exact dense array without invoking accessors", async () => {
  const sparse: unknown[] = [];
  sparse.length = 1;
  const sparseClient = new Client((text) => text.includes("payment_method_list")
    ? [{ outcome: "listed", result_payload: { items: sparse } }]
    : []);
  await assert.rejects(() => repository(new Pool([sparseClient])).list(authority()), errorCode("unavailable"));

  let invoked = false;
  const accessor: unknown[] = [];
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    get() { invoked = true; return method(); },
  });
  accessor.length = 1;
  const accessorClient = new Client((text) => text.includes("payment_method_list")
    ? [{ outcome: "listed", result_payload: { items: accessor } }]
    : []);
  await assert.rejects(() => repository(new Pool([accessorClient])).list(authority()), errorCode("unavailable"));
  assert.equal(invoked, false);
});

test("constructor rejects option and role substitution", () => {
  assert.throws(() => new PostgresPaymentMethodRepository({
    pool: new Pool([]),
    role: "celebix_saas_workflow" as never,
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit() {},
  }), errorCode("unavailable"));
  assert.throws(() => new PostgresPaymentMethodRepository({
    pool: new Pool([]), role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 0, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit() {}, extra: true,
  } as never), errorCode("unavailable"));
});
