import "server-only";
import { types as nodeTypes } from "node:util";
import { AKBANK_JSON_PACKET } from "@celebix/payment-adapters";

export type AkbankFormPostPresentation = Readonly<{
  kind: "form_post";
  url: string;
  fields: Readonly<Record<string, string>>;
}>;
const INVALID_UNICODE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function record(value: unknown): Record<string, PropertyDescriptor> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => typeof key === "string"
    && descriptors[key]?.enumerable && "value" in descriptors[key]!) ? descriptors : null;
}
function callback(value: string, hostname?: string): boolean {
  try {
    const url = new URL(value);
    const binding = url.pathname.split("/").at(-1) ?? "";
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
      && url.toString() === value && HOSTNAME.test(url.hostname) && (hostname === undefined || url.hostname === hostname)
      && url.pathname === `/api/payments/akbank_json/callback/${binding}`
      && /^[A-Za-z0-9_-]{43}$/.test(binding) && Buffer.from(binding, "base64url").toString("base64url") === binding;
  } catch { return false; }
}

/** Snapshot only the fixed card-free Akbank hosting contract. Never admit provider HTML. */
export function validateAkbankFormPost(
  value: unknown,
  environment?: "test" | "live",
  hostname?: string,
): AkbankFormPostPresentation | null {
  try {
    const descriptors = record(value);
    if (!descriptors || Reflect.ownKeys(descriptors).length !== 3 || descriptors.kind?.value !== "form_post"
      || typeof descriptors.url?.value !== "string" || !descriptors.fields) return null;
    const url = descriptors.url.value as string;
    const selectedEnvironment = environment ?? (["test", "live"] as const).find((entry) => { const rule = AKBANK_JSON_PACKET.presentation[entry]; return rule.kind === "provider_form_post" && rule.url === url; });
    if (selectedEnvironment !== "test" && selectedEnvironment !== "live") return null;
    const rule = AKBANK_JSON_PACKET.presentation[selectedEnvironment];
    if (rule.kind !== "provider_form_post" || url !== rule.url) return null;
    const fields = record(descriptors.fields.value);
    if (!fields || Reflect.ownKeys(fields).length !== rule.fieldNames.length) return null;
    const output: Record<string, string> = {};
    let size = 0;
    for (const name of rule.fieldNames) {
      const selected = fields[name];
      if (!selected || typeof selected.value !== "string" || selected.value.length > 2_048 || CONTROL.test(selected.value) || INVALID_UNICODE.test(selected.value)) return null;
      size += Buffer.byteLength(selected.value, "utf8");
      if (size > 16_384) return null;
      output[name] = selected.value;
    }
    if (output.paymentModel !== "3D_PAY_HOSTING" || output.txnCode !== "3000" || output.currencyCode !== "949"
      || output.installCount !== "1" || output.ccbRewardAmount !== "0.00" || output.pcbRewardAmount !== "0.00" || output.xcbRewardAmount !== "0.00"
      || !/^[A-Za-z0-9]{32}$/.test(output.merchantSafeId ?? "") || !/^[A-Za-z0-9]{32}$/.test(output.terminalSafeId ?? "")
      || !/^[A-Za-z0-9_-]{1,36}$/.test(output.orderId ?? "") || !["TR", "EN"].includes(output.lang ?? "")
      || !/^(?:0|[1-9][0-9]{0,13})\.[0-9]{2}$/.test(output.amount ?? "") || Number(output.amount) <= 0
      || !Number.isSafeInteger(Number(output.amount.replace(".", "")))
      || !/^[A-Fa-f0-9]{128}$/.test(output.randomNumber ?? "")
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(output.requestDateTime ?? "")
      || !Number.isFinite(Date.parse(output.requestDateTime!))
      || !/^[A-Za-z0-9+/]{86}==$/.test(output.hash ?? "") || Buffer.from(output.hash!, "base64").toString("base64") !== output.hash
      || !callback(output.okUrl ?? "", hostname) || output.failUrl !== output.okUrl) return null;
    // The initial implementation has no submerchant, wallet, mobile or B2B mode.
    for (const name of ["homePhone", "workPhone", "subMerchantId", "b2bIdentityNumber", "merchantData", "merchantBranchNo", "mobileEci", "walletProgramData", "mobileAssignedId", "mobileDeviceType"]) {
      if (output[name] !== "") return null;
    }
    return Object.freeze({ kind: "form_post", url, fields: Object.freeze(output) });
  } catch { return null; }
}

function escaped(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&#39;");
}

export function renderAkbankFormPost(value: unknown, nonce: string, hostname: string): Readonly<{ body: string; csp: string }> | null {
  const presentation = validateAkbankFormPost(value, undefined, hostname);
  if (!presentation || !/^[A-Za-z0-9+/]{32}$/.test(nonce)) return null;
  const fields = Object.entries(presentation.fields).map(([name, selected]) => `<input type="hidden" name="${escaped(name)}" value="${escaped(selected)}">`).join("");
  return Object.freeze({
    body: `<form id="bank-payment" method="post" action="${escaped(presentation.url)}" accept-charset="UTF-8">${fields}<p>Güvenli banka ödeme sayfasına yönlendiriliyorsunuz.</p><button type="submit">Banka ödeme sayfasına devam et</button></form><script nonce="${nonce}">document.getElementById("bank-payment").submit();</script>`,
    csp: `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action ${presentation.url}; frame-ancestors 'self'; object-src 'none'`,
  });
}
