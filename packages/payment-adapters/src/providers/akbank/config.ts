import { createHmac, timingSafeEqual } from "node:crypto";
import { types as nodeTypes } from "node:util";

const ENCODER = new TextEncoder();
const CREDENTIAL_KEYS = Object.freeze(["merchantSafeId", "terminalSafeId", "secretKey"]);
const CONTROL_OR_SPACE = /[\s\u0000-\u001f\u007f-\u009f]/u;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const BYTE_LENGTH = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE,"byteLength")!.get!;
const BACKING_BUFFER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE,"buffer")!.get!;

export type AkbankCredential = { merchantSafeId: string; terminalSafeId: string; secretKey: string };

function invalid(): never { throw new TypeError("akbank_credential_invalid"); }
function configInvalid(): never { throw new TypeError("akbank_config_invalid"); }

function exactInput(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) configInvalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== "string" || !keys.includes(key))) configInvalid();
  const selected: Record<string,unknown> = Object.create(null) as Record<string,unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) configInvalid();
    selected[key] = descriptor.value;
  }
  return selected;
}

export function parseAkbankCredential(value: unknown): AkbankCredential {
  try {
    if (typeof value !== "object" || value === null || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== CREDENTIAL_KEYS.length || keys.some(key => typeof key !== "string" || !CREDENTIAL_KEYS.includes(key))) invalid();
    const values: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const key of CREDENTIAL_KEYS) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || typeof descriptor.value !== "string") invalid();
      values[key] = descriptor.value;
    }
    if (!/^[A-Za-z0-9]{32}$/.test(values.merchantSafeId!) || !/^[A-Za-z0-9]{32}$/.test(values.terminalSafeId!)) invalid();
    let secretBytes: Uint8Array | undefined;
    try {
      secretBytes = ENCODER.encode(values.secretKey!);
      if (secretBytes.byteLength < 1 || secretBytes.byteLength > 256 || CONTROL_OR_SPACE.test(values.secretKey!) || SURROGATE.test(values.secretKey!)) invalid();
    } finally { secretBytes?.fill(0); }
    return { merchantSafeId: values.merchantSafeId!, terminalSafeId: values.terminalSafeId!, secretKey: values.secretKey! };
  } catch { return invalid(); }
}

export function wipeAkbankCredential(value: AkbankCredential): void {
  try { value.merchantSafeId = ""; value.terminalSafeId = ""; value.secretKey = ""; } catch { /* Cleanup cannot replace the provider outcome. */ }
}

function bodyBytes(value: unknown): Uint8Array {
  if (nodeTypes.isProxy(value) || !nodeTypes.isUint8Array(value) || Object.getPrototypeOf(value) !== Uint8Array.prototype) configInvalid();
  const length = Reflect.apply(BYTE_LENGTH,value,[]) as number;
  const buffer = Reflect.apply(BACKING_BUFFER,value,[]) as ArrayBufferLike;
  if (!(buffer instanceof ArrayBuffer) || length < 1 || length > 1_048_576) configInvalid();
  return value;
}

export function createAkbankHmac(input: Readonly<{ credential: Readonly<AkbankCredential>; body: Uint8Array }>): string {
  let credential: AkbankCredential | undefined;
  let secretBytes: Uint8Array | undefined;
  try {
    const selected = exactInput(input,["credential","body"]);
    credential = parseAkbankCredential(selected.credential);
    secretBytes = ENCODER.encode(credential.secretKey);
    return createHmac("sha512", secretBytes).update(bodyBytes(selected.body)).digest("base64");
  } finally { secretBytes?.fill(0); if (credential) wipeAkbankCredential(credential); }
}

export function verifyAkbankHmac(input: Readonly<{ credential: Readonly<AkbankCredential>; body: Uint8Array; providedSignature: string }>): boolean {
  let provided: Buffer | undefined;
  let expected: Buffer | undefined;
  try {
    const selected = exactInput(input,["credential","body","providedSignature"]);
    if (typeof selected.providedSignature !== "string" || !SIGNATURE.test(selected.providedSignature)) return false;
    provided = Buffer.from(selected.providedSignature, "base64");
    if (provided.byteLength !== 64 || provided.toString("base64") !== selected.providedSignature) return false;
    expected = Buffer.from(createAkbankHmac({credential:selected.credential as AkbankCredential,body:selected.body as Uint8Array}), "base64");
    return timingSafeEqual(provided, expected);
  } catch { return false; } finally { provided?.fill(0); expected?.fill(0); }
}
