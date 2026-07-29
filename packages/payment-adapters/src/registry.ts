import { types as utilTypes } from "node:util";

import type { HostedPaymentAdapter, PaymentAdapterPacket } from "./contracts.ts";
import { parsePaymentAdapterPacket } from "./validation.ts";

const PROVIDER_CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const ADAPTER_KEYS = Object.freeze([
  "initialize",
  "maskAccount",
  "packet",
  "parseCredential",
  "query",
  "verifyCallback",
]);

export interface PaymentAdapterRegistry {
  readonly size: number;
  packet(providerCode: string): PaymentAdapterPacket | null;
  adapter(providerCode: string): HostedPaymentAdapter<object> | null;
}

function invalid(): never {
  throw new TypeError("payment_adapter_registry_invalid");
}

function dense(value: unknown): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > 64
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    result.push(descriptor.value);
  }
  return result;
}

function immutablePacket(value: unknown): PaymentAdapterPacket {
  const parsed = parsePaymentAdapterPacket(value);
  const packet = value as PaymentAdapterPacket;
  if (
    !Object.isFrozen(packet) ||
    !Object.isFrozen(packet.readiness) ||
    !Object.isFrozen(packet.endpoints) ||
    !Object.isFrozen(packet.endpoints.test) ||
    !Object.isFrozen(packet.endpoints.live) ||
    !Object.isFrozen(packet.presentation) ||
    !Object.isFrozen(packet.presentation.test) ||
    !Object.isFrozen(packet.presentation.live) ||
    (
      packet.presentation.test.kind !== "exact_url" &&
      !Object.isFrozen(packet.presentation.test.token)
    ) ||
    (
      packet.presentation.live.kind !== "exact_url" &&
      !Object.isFrozen(packet.presentation.live.token)
    ) ||
    !Object.isFrozen(packet.publicFields) ||
    packet.publicFields.some((field) => !Object.isFrozen(field)) ||
    !Object.isFrozen(packet.credentialFields) ||
    packet.credentialFields.some((field) => !Object.isFrozen(field)) ||
    !Object.isFrozen(packet.capabilities) ||
    !Object.isFrozen(packet.documentation) ||
    packet.documentation.some((entry) => !Object.isFrozen(entry)) ||
    parsed.providerCode !== packet.providerCode ||
    parsed.adapterVersion !== packet.adapterVersion
  ) invalid();
  return packet;
}

function immutableAdapter(value: unknown): HostedPaymentAdapter<object> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    utilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !Object.isFrozen(value)
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== ADAPTER_KEYS.length ||
    keys.some((key) => typeof key !== "string" || !ADAPTER_KEYS.includes(key)) ||
    ADAPTER_KEYS.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ADAPTER_KEYS) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected[key] = descriptor.value;
  }
  for (const key of [
    "parseCredential",
    "maskAccount",
    "initialize",
    "verifyCallback",
    "query",
  ]) {
    const executable = selected[key];
    if (
      typeof executable !== "function" ||
      utilTypes.isProxy(executable) ||
      !Object.isFrozen(executable)
    ) invalid();
  }
  immutablePacket(selected.packet);
  return value as HostedPaymentAdapter<object>;
}

export function createPaymentAdapterRegistry(
  packets: readonly PaymentAdapterPacket[],
  adapters: readonly HostedPaymentAdapter<object>[],
): PaymentAdapterRegistry {
  try {
    const packetEntries = dense(packets).map(immutablePacket);
    const adapterEntries = dense(adapters).map(immutableAdapter);
    const packetsByCode = new Map<string, PaymentAdapterPacket>();
    const adaptersByCode = new Map<string, HostedPaymentAdapter<object>>();
    for (const packet of packetEntries) {
      if (packetsByCode.has(packet.providerCode)) invalid();
      packetsByCode.set(packet.providerCode, packet);
    }
    for (const adapter of adapterEntries) {
      const code = adapter.packet.providerCode;
      if (adaptersByCode.has(code)) invalid();
      const packet = packetsByCode.get(code);
      if (
        packet === undefined ||
        adapter.packet !== packet ||
        adapter.packet.adapterVersion !== packet.adapterVersion
      ) invalid();
      adaptersByCode.set(code, adapter);
    }
    if (packetsByCode.size !== adaptersByCode.size) invalid();
    return Object.freeze({
      size: packetsByCode.size,
      packet(providerCode: string): PaymentAdapterPacket | null {
        if (typeof providerCode !== "string" || !PROVIDER_CODE.test(providerCode)) return null;
        return packetsByCode.get(providerCode) ?? null;
      },
      adapter(providerCode: string): HostedPaymentAdapter<object> | null {
        if (typeof providerCode !== "string" || !PROVIDER_CODE.test(providerCode)) return null;
        return adaptersByCode.get(providerCode) ?? null;
      },
    });
  } catch {
    return invalid();
  }
}
