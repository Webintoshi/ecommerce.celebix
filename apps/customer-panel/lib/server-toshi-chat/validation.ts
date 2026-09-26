export const TOSHI_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw Error("invalid_arguments");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw Error("invalid_arguments");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== "string" || !keys.includes(key))) throw Error("invalid_arguments");
  const output: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !d.enumerable || !("value" in d)) throw Error("invalid_arguments");
    output[key] = d.value;
  }
  return output;
}

export function optionalText(value: unknown, maximum = 160): string | undefined {
  if (value === null) return undefined;
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw Error("invalid_arguments");
  return value;
}

export function entityId(value: unknown): string {
  if (typeof value !== "string" || !TOSHI_UUID.test(value)) throw Error("invalid_arguments");
  return value;
}

export function selection<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  if (value === null) return undefined;
  if (typeof value !== "string" || !options.includes(value as T)) throw Error("invalid_arguments");
  return value as T;
}

export function safeText(value: string, maximum = 300): string {
  return value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "").slice(0, maximum);
}
