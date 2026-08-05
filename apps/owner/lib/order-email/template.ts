import type { OrderEmailEventType, OrderEmailRecipientKind } from "@celebix/saas-contracts";
import type { OrderEmailProjection } from "@celebix/saas-data";

export type OrderEmailTemplateInput = Readonly<{
  eventType: OrderEmailEventType;
  recipientKind: OrderEmailRecipientKind;
  storeId: string;
  orderId: string;
  projection: Readonly<OrderEmailProjection>;
}>;

export type RenderedOrderEmail = Readonly<{ subject: string; html: string; text: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const FIRST_PARTY_MEDIA = new Set(["media.saas-staging.celebix.site", "media.celebix.site"]);
const TITLES: Readonly<Record<OrderEmailEventType, string>> = Object.freeze({
  order_received: "Siparişinizi aldık",
  payment_completed: "Ödemeniz tamamlandı",
  order_shipped: "Siparişiniz kargoda",
  order_delivered: "Siparişiniz teslim edildi",
  order_cancelled: "Siparişiniz iptal edildi",
  refund_completed: "İadeniz tamamlandı",
  merchant_new_order: "Yeni sipariş",
});

function invalid(): never { throw new Error("order_email_template_invalid"); }
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function safeText(value: unknown, minimum = 1, maximum = 2_048): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) invalid();
  return value;
}
function safeOrigin(value: string): URL {
  let selected: URL;
  try { selected = new URL(value); } catch { invalid(); }
  if (selected.protocol !== "https:" || selected.username || selected.password || selected.pathname !== "/" || selected.search || selected.hash || selected.origin !== value) invalid();
  return selected;
}
function brandColor(value: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/u.test(value)) return "#171717";
  const channels = [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  return 1.05 / (luminance + 0.05) >= 4.5 ? value.toUpperCase() : "#171717";
}
function logo(value: string | undefined, storeId: string): string | undefined {
  if (value === undefined) return undefined;
  let selected: URL;
  try { selected = new URL(value); } catch { return undefined; }
  if (selected.protocol !== "https:" || selected.username || selected.password || selected.search || selected.hash || !FIRST_PARTY_MEDIA.has(selected.hostname) || !selected.pathname.startsWith(`/stores/${storeId}/`)) return undefined;
  return selected.toString();
}
function money(cents: number, currency: string): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || !/^[A-Z]{3}$/u.test(currency)) invalid();
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(cents / 100);
}
function row(label: string, value: string): string {
  return `<tr><td style="padding:8px 0;color:#71717a;font-size:14px">${escapeHtml(label)}</td><td style="padding:8px 0;text-align:right;color:#171717;font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`;
}

export function renderOrderEmail(input: OrderEmailTemplateInput): RenderedOrderEmail {
  if (!UUID.test(input.storeId) || !UUID.test(input.orderId) || (input.eventType === "merchant_new_order") !== (input.recipientKind === "merchant")) invalid();
  const value = input.projection;
  const storeName = safeText(value.storeName, 1, 160);
  const customerName = safeText(value.customerName, 1, 200);
  const orderNumber = safeText(value.orderNumber, 1, 64);
  const heading = TITLES[input.eventType];
  const origin = input.recipientKind === "merchant"
    ? safeOrigin(value.adminOrigin ?? invalid())
    : safeOrigin(value.storefrontOrigin);
  const actionUrl = input.recipientKind === "merchant"
    ? new URL(`/orders/${input.orderId}`, origin).toString()
    : new URL("/account/orders", origin).toString();
  const selectedColor = brandColor(value.primaryColor);
  const selectedLogo = logo(value.logoUrl, input.storeId);
  const subject = `${heading} · ${orderNumber}`;
  const itemRows = value.items.map((item) => {
    const name = `${safeText(item.productName, 1, 200)}${item.variantName ? ` · ${safeText(item.variantName, 1, 200)}` : ""}`;
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #eeeeec;color:#171717;font-size:14px">${escapeHtml(name)} × ${item.quantity}</td><td style="padding:12px 0;border-bottom:1px solid #eeeeec;text-align:right;color:#171717;font-size:14px">${escapeHtml(money(item.lineTotalCents, value.currency))}</td></tr>`;
  }).join("");
  const tracking = input.eventType === "order_shipped" && value.tracking
    ? `<p style="margin:18px 0 0;color:#52525b;font-size:14px;line-height:1.6"><strong>${escapeHtml(safeText(value.tracking.carrier, 1, 100))}</strong><br>${escapeHtml(safeText(value.tracking.trackingNumber, 1, 200))}</p>`
    : "";
  const logoMarkup = selectedLogo
    ? `<img src="${escapeHtml(selectedLogo)}" width="160" alt="${escapeHtml(storeName)}" style="display:block;max-width:160px;max-height:64px;width:auto;height:auto;border:0">`
    : `<div style="font-size:20px;font-weight:700;color:#171717">${escapeHtml(storeName)}</div>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f6f6f4;color:#171717;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f4"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px"><tr><td style="padding:32px">${logoMarkup}<p style="margin:32px 0 8px;color:${selectedColor};font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(orderNumber)}</p><h1 style="margin:0;color:#171717;font-size:30px;line-height:1.2">${escapeHtml(heading)}</h1><p style="margin:12px 0 24px;color:#52525b;font-size:15px;line-height:1.65">${escapeHtml(customerName)}, siparişinizle ilgili güncel bilgiler aşağıdadır.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemRows}${row("Ara toplam", money(value.subtotalCents, value.currency))}${row("Kargo", money(value.shippingCents, value.currency))}${value.discountCents > 0 ? row("İndirim", `−${money(value.discountCents, value.currency)}`) : ""}${row("Toplam", money(value.totalCents, value.currency))}</table>${tracking}<p style="margin:28px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 22px;background:${selectedColor};border-radius:10px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">Siparişi görüntüle</a></p><p style="margin:28px 0 0;color:#a1a1aa;font-size:12px;line-height:1.5">${escapeHtml(storeName)}</p></td></tr></table></td></tr></table></body></html>`;
  const textItems = value.items.map((item) => `- ${item.productName}${item.variantName ? ` · ${item.variantName}` : ""} × ${item.quantity}: ${money(item.lineTotalCents, value.currency)}`).join("\n");
  const text = `${heading}\n${orderNumber}\n\n${customerName}, siparişinizle ilgili güncel bilgiler aşağıdadır.\n\n${textItems}\n\nAra toplam: ${money(value.subtotalCents, value.currency)}\nKargo: ${money(value.shippingCents, value.currency)}${value.discountCents > 0 ? `\nİndirim: −${money(value.discountCents, value.currency)}` : ""}\nToplam: ${money(value.totalCents, value.currency)}${input.eventType === "order_shipped" && value.tracking ? `\n\n${value.tracking.carrier}: ${value.tracking.trackingNumber}` : ""}\n\n${actionUrl}\n\n${storeName}`;
  return Object.freeze({ subject, html, text });
}
