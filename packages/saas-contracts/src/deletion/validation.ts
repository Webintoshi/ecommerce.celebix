import {
  PERMANENT_DELETION_DISPOSITIONS,
  PERMANENT_DELETION_EFFECT_KINDS,
  PERMANENT_DELETION_RESOURCE_KINDS,
  type PermanentDeletionCommand,
  type PermanentDeletionDisposition,
  type PermanentDeletionEffect,
  type PermanentDeletionEffectKind,
  type PermanentDeletionImpact,
  type PermanentDeletionResourceKind,
  type PermanentDeletionResult,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

function invalid(): never {
  throw new TypeError("permanent_deletion_contract_invalid");
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  if (Object.getOwnPropertySymbols(value).length !== 0) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined || descriptor.enumerable !== true) invalid();
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]),
  ));
}

function exact(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  const selected = record(value);
  const actual = Object.keys(selected).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid();
  return selected;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function safeInteger(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid();
  return value as number;
}

function boundedText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    value !== value.trim() ||
    CONTROL.test(value)
  ) invalid();
  return value;
}

function boolean(value: unknown): boolean {
  if (value !== true && value !== false) invalid();
  return value;
}

function resourceKind(value: unknown): PermanentDeletionResourceKind {
  return enumValue(value, PERMANENT_DELETION_RESOURCE_KINDS);
}

function effect(value: unknown, kind: PermanentDeletionResourceKind): PermanentDeletionEffect {
  const selected = exact(value, ["kind", "count", "disposition"]);
  const allowedKinds = PERMANENT_DELETION_EFFECT_KINDS[kind] as readonly PermanentDeletionEffectKind[];
  return Object.freeze({
    kind: enumValue(selected.kind, allowedKinds),
    count: safeInteger(selected.count, 0),
    disposition: enumValue<PermanentDeletionDisposition>(selected.disposition, PERMANENT_DELETION_DISPOSITIONS),
  });
}

function effects(value: unknown, kind: PermanentDeletionResourceKind): readonly PermanentDeletionEffect[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 64) invalid();
  for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) invalid();
  return Object.freeze(value.map((entry) => effect(entry, kind)));
}

export function parsePermanentDeletionImpact(value: unknown): PermanentDeletionImpact {
  const selected = exact(value, [
    "resourceKind",
    "resourceId",
    "expectedVersion",
    "confirmationLabel",
    "effects",
  ]);
  const kind = resourceKind(selected.resourceKind);
  return Object.freeze({
    resourceKind: kind,
    resourceId: uuid(selected.resourceId),
    expectedVersion: safeInteger(selected.expectedVersion, 1),
    confirmationLabel: boundedText(selected.confirmationLabel),
    effects: effects(selected.effects, kind),
  });
}

export function parsePermanentDeletionCommand(value: unknown): PermanentDeletionCommand {
  const selected = exact(value, ["operationId", "expectedVersion", "confirmation"]);
  return Object.freeze({
    operationId: uuid(selected.operationId),
    expectedVersion: safeInteger(selected.expectedVersion, 1),
    confirmation: boundedText(selected.confirmation),
  });
}

export function parsePermanentDeletionResult(value: unknown): PermanentDeletionResult {
  const selected = exact(value, ["resourceKind", "resourceId", "deleted", "auditId", "replayed"]);
  if (selected.deleted !== true) invalid();
  return Object.freeze({
    resourceKind: resourceKind(selected.resourceKind),
    resourceId: uuid(selected.resourceId),
    deleted: true,
    auditId: uuid(selected.auditId),
    replayed: boolean(selected.replayed),
  });
}
