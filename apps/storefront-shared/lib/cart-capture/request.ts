import type { PublicAbandonedCartCustomerInput, PublicAbandonedCartItemInput } from "@celebix/saas-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAXIMUM = 32_768;

function object(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  const parsed = object(value); if (parsed === null) return null;
  const allowed = new Set([...required, ...optional]);
  return required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key)) ? null : parsed;
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum && value === value.trim() && !CONTROL.test(value) ? value : null;
}

function customer(value: unknown): PublicAbandonedCartCustomerInput | null {
  const parsed = exact(value, [], ["name", "email", "phone"]); if (parsed === null) return null;
  const name = Object.hasOwn(parsed, "name") ? text(parsed.name, 1, 200) : undefined;
  const email = Object.hasOwn(parsed, "email") ? text(parsed.email, 3, 320) : undefined;
  const phone = Object.hasOwn(parsed, "phone") ? text(parsed.phone, 3, 32) : undefined;
  if ((Object.hasOwn(parsed, "name") && name === null) || (Object.hasOwn(parsed, "email") && email === null) || (Object.hasOwn(parsed, "phone") && phone === null)) return null;
  return Object.freeze({ ...(name ? { name } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}) });
}

function items(value: unknown): readonly PublicAbandonedCartItemInput[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 100) return null;
  const seen = new Set<string>();
  const parsed: PublicAbandonedCartItemInput[] = [];
  for (const entry of value) {
    const item = exact(entry, ["productId", "variantId", "quantity"]);
    if (item === null || typeof item.productId !== "string" || !UUID.test(item.productId) || typeof item.variantId !== "string" || !UUID.test(item.variantId) || seen.has(item.variantId) || !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > 9_999) return null;
    seen.add(item.variantId);
    parsed.push(Object.freeze({ productId: item.productId, variantId: item.variantId, quantity: item.quantity as number }));
  }
  return Object.freeze(parsed);
}

export async function readCartCaptureBody(request: Request): Promise<Readonly<{ customer: PublicAbandonedCartCustomerInput; items: readonly PublicAbandonedCartItemInput[] }> | null> {
  if (request.headers.get("content-type") !== "application/json" || request.headers.get("transfer-encoding") !== null || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > MAXIMUM)) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength; if (total > MAXIMUM) { await reader.cancel().catch(() => undefined); return null; }
      chunks.push(new Uint8Array(next.value));
    }
  } catch { return null; }
  if (total === 0) return null;
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: unknown; try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
  const root = exact(raw, ["customer", "items"]); if (root === null) return null;
  const parsedCustomer = customer(root.customer); const parsedItems = items(root.items);
  return parsedCustomer === null || parsedItems === null ? null : Object.freeze({ customer: parsedCustomer, items: parsedItems });
}
