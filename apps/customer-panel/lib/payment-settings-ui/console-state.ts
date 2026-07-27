import type { MerchantPaymentMethod } from "@celebix/saas-contracts";

import type { PaymentMethodOrderCommand } from "../payment-method-ui/client.ts";

export type PaymentSettingsSourceSlice<T> = Readonly<{
  phase: "loading" | "ready" | "error";
  value: readonly T[];
}>;

export type PaymentSettingsSources<C, D, P, M> = Readonly<{
  catalog: PaymentSettingsSourceSlice<C>;
  definitions: PaymentSettingsSourceSlice<D>;
  profiles: PaymentSettingsSourceSlice<P>;
  methods: PaymentSettingsSourceSlice<M>;
}>;

function slice<T>(result: PromiseSettledResult<readonly T[]>): PaymentSettingsSourceSlice<T> {
  return result.status === "fulfilled"
    ? Object.freeze({ phase: "ready", value: Object.freeze([...result.value]) })
    : Object.freeze({ phase: "error", value: Object.freeze([]) });
}

export function createLoadingPaymentSettingsSources<C, D, P, M>(): PaymentSettingsSources<C, D, P, M> {
  const loading = <T>(): PaymentSettingsSourceSlice<T> => Object.freeze({ phase: "loading", value: Object.freeze([]) });
  return Object.freeze({
    catalog: loading<C>(),
    definitions: loading<D>(),
    profiles: loading<P>(),
    methods: loading<M>(),
  });
}

export async function loadPaymentSettingsSources<C, D, P, M>(loaders: Readonly<{
  catalog(): Promise<readonly C[]>;
  definitions(): Promise<readonly D[]>;
  profiles(): Promise<readonly P[]>;
  methods(): Promise<readonly M[]>;
}>): Promise<PaymentSettingsSources<C, D, P, M>> {
  const [catalog, definitions, profiles, methods] = await Promise.allSettled([
    loaders.catalog(),
    loaders.definitions(),
    loaders.profiles(),
    loaders.methods(),
  ]);
  return Object.freeze({
    catalog: slice(catalog),
    definitions: slice(definitions),
    profiles: slice(profiles),
    methods: slice(methods),
  });
}

export function movePaymentMethodOrder(
  order: readonly string[],
  methodId: string,
  direction: "up" | "down",
): readonly string[] {
  const index = order.indexOf(methodId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return Object.freeze([...order]);
  const selected = [...order];
  [selected[index], selected[target]] = [selected[target]!, selected[index]!];
  return Object.freeze(selected);
}

export function hasPaymentMethodOrderChanged(
  original: readonly string[],
  selected: readonly string[],
): boolean {
  return original.length !== selected.length || original.some((id, index) => selected[index] !== id);
}

export function buildPaymentMethodOrderCommands(
  methods: readonly MerchantPaymentMethod[],
  order: readonly string[],
): readonly PaymentMethodOrderCommand[] {
  if (
    methods.length < 1
    || methods.length !== order.length
    || new Set(order).size !== order.length
    || new Set(methods.map(({ id }) => id)).size !== methods.length
  ) throw new TypeError("payment_method_order_invalid");
  const byId = new Map(methods.map((item) => [item.id, item] as const));
  const commands = order.map((id, position) => {
    const selected = byId.get(id);
    if (!selected) throw new TypeError("payment_method_order_invalid");
    return Object.freeze({ id, expectedVersion: selected.version, position });
  });
  return Object.freeze(commands);
}
