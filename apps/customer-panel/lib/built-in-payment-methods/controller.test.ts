import assert from "node:assert/strict";
import test from "node:test";

import type {
  BuiltInPaymentMethodKind,
  MerchantPaymentMethod,
  PaymentMethodMutationResult,
} from "@celebix/saas-contracts";

import {
  PaymentMethodApiError,
  type SavePaymentMethodCommand,
  type SetPaymentMethodStateCommand,
} from "../payment-method-ui/client.ts";
import {
  saveBuiltInPaymentMethod,
  selectBuiltInPaymentMethod,
} from "./controller.ts";

const NOW = "2026-07-28T09:00:00.000Z";
const CASH_ID = "51000000-0000-4000-8000-000000000001";
const BANK_ID = "51000000-0000-4000-8000-000000000002";

function method(
  kind: BuiltInPaymentMethodKind,
  state: MerchantPaymentMethod["state"] = "active",
  version = 4,
): MerchantPaymentMethod {
  return Object.freeze({
    id: kind === "cash_on_delivery" ? CASH_ID : BANK_ID,
    kind,
    profileId: null,
    providerCode: null,
    label: kind === "cash_on_delivery" ? "Kapıda ödeme" : "Banka havalesi",
    state,
    emergencyReason: state === "emergency_disabled" ? "Risk kontrolü" : null,
    position: kind === "cash_on_delivery" ? 0 : 1,
    config: kind === "cash_on_delivery"
      ? Object.freeze({ instructions: "Teslimatta ödeme yapın." })
      : Object.freeze({
        accountHolder: "Örnek Ticaret Ltd. Şti.",
        bankName: "Örnek Bankası",
        iban: "TR330006100519786457841326",
        instructions: "Sipariş numaranızı açıklamaya yazın.",
      }),
    version,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function mutation(
  id: string,
  state: MerchantPaymentMethod["state"],
  version: number,
): PaymentMethodMutationResult {
  return Object.freeze({
    id,
    state,
    position: 0,
    version,
    updatedAt: NOW,
    replayed: false,
  });
}

test("new built-in save activates the returned method version in order", async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const api = Object.freeze({
    async save(input: SavePaymentMethodCommand) {
      calls.push(["save", {
        expectedVersion: input.expectedVersion,
        kind: input.kind,
      }]);
      assert.deepEqual(input, {
        methodId: CASH_ID,
        expectedVersion: 0,
        kind: "cash_on_delivery",
        profileId: null,
        providerCode: null,
        label: "Kapıda ödeme",
        config: Object.freeze({ instructions: "Teslimatta ödeme yapın." }),
      });
      return mutation(CASH_ID, "disabled", 1);
    },
    async setState(methodId: string, input: SetPaymentMethodStateCommand) {
      assert.equal(methodId, CASH_ID);
      calls.push(["setState", {
        expectedVersion: input.expectedVersion,
        state: input.state,
        emergencyReason: input.emergencyReason,
      }]);
      return mutation(CASH_ID, "active", 2);
    },
  });

  const result = await saveBuiltInPaymentMethod({
    kind: "cash_on_delivery",
    method: null,
    label: "Kapıda ödeme",
    config: Object.freeze({ instructions: "Teslimatta ödeme yapın." }),
    api,
    methodId: CASH_ID,
  });

  assert.deepEqual(calls, [
    ["save", { expectedVersion: 0, kind: "cash_on_delivery" }],
    ["setState", { expectedVersion: 1, state: "active", emergencyReason: null }],
  ]);
  assert.deepEqual(result, Object.freeze({
    kind: "active",
    methodId: CASH_ID,
    message: "Yerleşik ödeme yöntemi kaydedildi ve etkinleştirildi.",
  }));
  assert.equal(Object.isFrozen(result), true);
});

test("editing a built-in method reuses its identity and never changes its state", async () => {
  for (const state of ["active", "disabled"] as const) {
    const existing = method("bank_transfer", state, 8);
    const saves: unknown[] = [];
    let stateCalls = 0;
    const result = await saveBuiltInPaymentMethod({
      kind: "bank_transfer",
      method: existing,
      label: "Havale ile ödeme",
      config: Object.freeze({
        accountHolder: "Örnek Ticaret Ltd. Şti.",
        bankName: "Örnek Bankası",
        iban: "TR330006100519786457841326",
        instructions: "Açıklamaya sipariş numaranızı yazın.",
      }),
      methodId: CASH_ID,
      api: Object.freeze({
        async save(input: unknown) {
          saves.push(input);
          return mutation(existing.id, state, 9);
        },
        async setState() {
          stateCalls += 1;
          throw new Error("edit_must_not_set_state");
        },
      }),
    });

    assert.deepEqual(saves, [{
      methodId: BANK_ID,
      expectedVersion: 8,
      kind: "bank_transfer",
      profileId: null,
      providerCode: null,
      label: "Havale ile ödeme",
      config: Object.freeze({
        accountHolder: "Örnek Ticaret Ltd. Şti.",
        bankName: "Örnek Bankası",
        iban: "TR330006100519786457841326",
        instructions: "Açıklamaya sipariş numaranızı yazın.",
      }),
    }]);
    assert.equal(stateCalls, 0);
    assert.deepEqual(result, Object.freeze({
      kind: "updated",
      methodId: BANK_ID,
      message: "Yerleşik ödeme yöntemi güncellendi.",
    }));
  }
});

test("editing an emergency-disabled method preserves the emergency stop", async () => {
  const existing = method("cash_on_delivery", "emergency_disabled", 12);
  let stateCalls = 0;
  const result = await saveBuiltInPaymentMethod({
    kind: "cash_on_delivery",
    method: existing,
    label: "Kapıda ödeme",
    config: Object.freeze({ instructions: "Teslimatta ödeme yapın." }),
    methodId: BANK_ID,
    api: Object.freeze({
      async save() {
        return mutation(existing.id, "emergency_disabled", 13);
      },
      async setState() {
        stateCalls += 1;
        throw new Error("emergency_stop_must_not_be_cleared");
      },
    }),
  });

  assert.equal(stateCalls, 0);
  assert.deepEqual(result, Object.freeze({
    kind: "emergency_disabled",
    methodId: CASH_ID,
    message: "Ödeme yöntemi güncellendi; acil durum kapatması korunuyor.",
  }));
});

test("duplicate recovery selects only the exact built-in kind", () => {
  const cash = method("cash_on_delivery");
  const bank = method("bank_transfer");
  const provider = Object.freeze({
    ...cash,
    id: "51000000-0000-4000-8000-000000000099",
    kind: "provider" as const,
    profileId: "51000000-0000-4000-8000-000000000098",
    providerCode: "iyzico_iframe",
  });

  assert.equal(selectBuiltInPaymentMethod([provider, bank, cash], "cash_on_delivery"), cash);
  assert.equal(selectBuiltInPaymentMethod([provider, cash, bank], "bank_transfer"), bank);
  assert.equal(selectBuiltInPaymentMethod([provider], "cash_on_delivery"), null);
});

test("finite conflicts and ambiguous outcomes return only safe console messages", async () => {
  for (const code of ["method_already_exists", "version_conflict"] as const) {
    const result = await saveBuiltInPaymentMethod({
      kind: "cash_on_delivery",
      method: null,
      label: "Kapıda ödeme",
      config: Object.freeze({ instructions: "" }),
      methodId: CASH_ID,
      api: Object.freeze({
        async save() { throw new PaymentMethodApiError(code, 409); },
        async setState() { throw new Error("state_must_not_run"); },
      }),
    });
    assert.deepEqual(result, Object.freeze({
      kind: "conflict",
      methodId: CASH_ID,
      message: "Ödeme yöntemi başka bir işlem tarafından değiştirildi. Güncel bilgiler yeniden yüklenmeli.",
    }));
  }

  for (const failure of [
    new PaymentMethodApiError("unavailable", 503),
    new Error("private transport detail"),
  ]) {
    const result = await saveBuiltInPaymentMethod({
      kind: "bank_transfer",
      method: null,
      label: "Banka havalesi",
      config: Object.freeze({
        accountHolder: "Örnek Ticaret Ltd. Şti.",
        bankName: "Örnek Bankası",
        iban: "TR330006100519786457841326",
        instructions: "",
      }),
      methodId: BANK_ID,
      api: Object.freeze({
        async save() { throw failure; },
        async setState() { throw new Error("state_must_not_run"); },
      }),
    });
    assert.deepEqual(result, Object.freeze({
      kind: "ambiguous",
      methodId: BANK_ID,
      message: "Kaydın sonucu doğrulanamadı. Güncel bilgiler yeniden yüklenmeden tekrar deneyemezsiniz.",
    }));
    assert.doesNotMatch(result.message, /private|transport|503/i);
  }
});
