import {
  parseBuiltInPaymentMethodConfig,
  type BuiltInPaymentMethodKind,
  type MerchantAdminJson,
  type MerchantPaymentMethod,
  type PaymentMethodMutationResult,
} from "@celebix/saas-contracts";

import {
  PaymentMethodApiError,
  type SavePaymentMethodCommand,
  type SetPaymentMethodStateCommand,
} from "../payment-method-ui/client.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ENCODER = new TextEncoder();
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;

const RESULT_MESSAGES = Object.freeze({
  active: "Yerleşik ödeme yöntemi kaydedildi ve etkinleştirildi.",
  updated: "Yerleşik ödeme yöntemi güncellendi.",
  emergency_disabled: "Ödeme yöntemi güncellendi; acil durum kapatması korunuyor.",
  conflict: "Ödeme yöntemi başka bir işlem tarafından değiştirildi. Güncel bilgiler yeniden yüklenmeli.",
  ambiguous: "Kaydın sonucu doğrulanamadı. Güncel bilgiler yeniden yüklenmeden tekrar deneyemezsiniz.",
} as const);

type BuiltInPaymentMethodResult<Kind extends keyof typeof RESULT_MESSAGES> = Readonly<{
  kind: Kind;
  methodId: string;
  message: (typeof RESULT_MESSAGES)[Kind];
}>;

type BuiltInPaymentMethodConflictResult = Readonly<
  BuiltInPaymentMethodResult<"conflict"> & {
    reason: PaymentMethodApiError["code"];
  }
>;

type BuiltInPaymentMethodNonConflictKind = Exclude<
  keyof typeof RESULT_MESSAGES,
  "conflict"
>;

export type BuiltInPaymentMethodSaveResult =
  | {
    [Kind in BuiltInPaymentMethodNonConflictKind]: BuiltInPaymentMethodResult<Kind>;
  }[BuiltInPaymentMethodNonConflictKind]
  | BuiltInPaymentMethodConflictResult;

export type BuiltInPaymentMethodApi = Readonly<{
  save(input: SavePaymentMethodCommand): Promise<PaymentMethodMutationResult>;
  setState(
    methodId: string,
    input: SetPaymentMethodStateCommand,
  ): Promise<PaymentMethodMutationResult>;
}>;

function invalid(): never {
  throw new TypeError("built_in_payment_method_controller_invalid");
}

function canonicalLabel(value: string): string {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || ENCODER.encode(value).byteLength < 1
    || ENCODER.encode(value).byteLength > 120
    || CONTROL.test(value)
    || SURROGATE.test(value)
  ) invalid();
  return value;
}

function result<Kind extends keyof typeof RESULT_MESSAGES>(
  kind: Kind,
  methodId: string,
): BuiltInPaymentMethodResult<Kind> {
  return Object.freeze({
    kind,
    methodId,
    message: RESULT_MESSAGES[kind],
  }) as BuiltInPaymentMethodResult<Kind>;
}

function failed(error: unknown, methodId: string): BuiltInPaymentMethodSaveResult {
  if (!(error instanceof PaymentMethodApiError)) throw error;
  return error.code === "unavailable"
    ? result("ambiguous", methodId)
    : Object.freeze({
      ...result("conflict", methodId),
      reason: error.code,
    });
}

export function selectBuiltInPaymentMethod(
  methods: readonly MerchantPaymentMethod[],
  kind: BuiltInPaymentMethodKind,
): MerchantPaymentMethod | null {
  const selected = methods.filter((method) => method.kind === kind);
  if (selected.length > 1) invalid();
  return selected[0] ?? null;
}

export async function saveBuiltInPaymentMethod(input: Readonly<{
  kind: BuiltInPaymentMethodKind;
  method: MerchantPaymentMethod | null;
  label: string;
  config: Readonly<Record<string, MerchantAdminJson>>;
  api: BuiltInPaymentMethodApi;
  methodId: string;
}>): Promise<BuiltInPaymentMethodSaveResult> {
  const existing = input.method;
  if (existing !== null && (
    existing.kind !== input.kind
    || existing.profileId !== null
    || existing.providerCode !== null
  )) invalid();
  const selectedMethodId = existing?.id ?? input.methodId;
  if (!UUID.test(selectedMethodId)) invalid();
  const command = Object.freeze({
    methodId: selectedMethodId,
    expectedVersion: existing?.version ?? 0,
    kind: input.kind,
    profileId: null,
    providerCode: null,
    label: canonicalLabel(input.label),
    config: parseBuiltInPaymentMethodConfig(input.kind, input.config),
  });

  let saved: PaymentMethodMutationResult;
  try {
    saved = await input.api.save(command);
  } catch (error) {
    return failed(error, selectedMethodId);
  }
  if (saved.id !== selectedMethodId) return result("ambiguous", selectedMethodId);

  if (existing !== null) {
    return existing.state === "emergency_disabled"
      ? result("emergency_disabled", selectedMethodId)
      : result("updated", selectedMethodId);
  }
  if (saved.state === "active") return result("active", selectedMethodId);
  if (saved.state !== "disabled") return result("ambiguous", selectedMethodId);

  try {
    const activated = await input.api.setState(selectedMethodId, Object.freeze({
      expectedVersion: saved.version,
      state: "active",
      emergencyReason: null,
    }));
    return activated.id === selectedMethodId && activated.state === "active"
      ? result("active", selectedMethodId)
      : result("ambiguous", selectedMethodId);
  } catch (error) {
    return failed(error, selectedMethodId);
  }
}
