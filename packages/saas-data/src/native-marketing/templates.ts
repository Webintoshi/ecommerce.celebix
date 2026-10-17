import type { NativeMarketingProjection, NativeMarketingTemplate } from "./types.ts";

export const NATIVE_MARKETING_TEMPLATE_DEFAULTS = Object.freeze(([
  { id: "cart", label: "Sepet hatırlatma", description: "Yarım kalan alışverişe güvenli dönüş.", subject: "Sepetiniz sizi bekliyor", heading: "Beğendikleriniz burada", body: "Sepetinizdeki ürünleri sizin için bir araya getirdik. Alışverişinize kaldığınız yerden devam edebilirsiniz.", buttonLabel: "Sepetime dön", buttonPath: "/cart", version: 1 },
  { id: "new_products", label: "Yeni ürünler", description: "Mağazanıza yeni gelenleri paylaşın.", subject: "Yeni gelenleri keşfedin", heading: "Yeni favorilerinizle tanışın", body: "Koleksiyonumuza yeni eklenen ürünleri sizin için seçtik. Ayrıntıları mağazamızda inceleyebilirsiniz.", buttonLabel: "Yeni ürünleri keşfet", buttonPath: "/products", version: 1 },
  { id: "offer", label: "Özel teklif", description: "Bir kampanya veya mağaza duyurusu.", subject: "Size özel bir haberimiz var", heading: "Seçtiklerinize yeniden bakın", body: "Mağazamızdan sizinle paylaşmak istediğimiz bir haber var. Güncel ürünleri ve teklifleri mağazamızda bulabilirsiniz.", buttonLabel: "Mağazayı ziyaret et", buttonPath: "/", version: 1 },
  { id: "welcome", label: "Hoş geldiniz", description: "İzin veren müşterilerinize sıcak bir karşılama.", subject: "Aramıza hoş geldiniz", heading: "Sizi burada görmek güzel", body: "Mağazamızdan haber almak istediğiniz için teşekkür ederiz. Yeni ürünleri ve size uygun haberleri burada paylaşacağız.", buttonLabel: "Mağazayı keşfet", buttonPath: "/", version: 1 },
] as const).map(value => Object.freeze(value)) satisfies readonly (NativeMarketingTemplate & Readonly<{ label: string; description: string }>)[]);

export type NativeMarketingTemplateInput = Readonly<{ storeId: string; projection: NativeMarketingProjection; unsubscribeUrl: string; recoveryUrl?: string; postalAddress?: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MEDIA = new Set(["media.celebix.site", "media.saas-staging.celebix.site"]);
function invalid(): never { throw new Error("native_marketing_template_invalid"); }
function escape(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > max || (multiline ? /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u : /[\u0000-\u001f\u007f-\u009f]/u).test(value)) invalid();
  return value;
}
function origin(value: string): string {
  let url: URL; try { url = new URL(value); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.origin !== value) invalid(); return url.origin;
}
function sameSite(value: string, site: string): string {
  let url: URL; try { url = new URL(value, site); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.origin !== site || url.username || url.password || /[\s\u0000-\u001f]/u.test(value) || value.startsWith("//") || value.includes("\\")) invalid(); return url.toString();
}
function image(value: string | undefined, storeId: string, site: string): string | undefined {
  if (!value) return undefined;
  let url: URL; try { url = new URL(value, site); } catch { return undefined; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return undefined;
  if (MEDIA.has(url.hostname) && url.pathname.startsWith(`/stores/${storeId}/`) && !/%|\.\./u.test(value)) {
    // Keep the existing Lilyum storefront's one original-logo migration exact.
    if (storeId === "89e1e15f-8282-4e9b-ae3e-f417501bd54a" && url.pathname === `/stores/${storeId}/design/c9c0df33-d646-59a4-ba36-a538b32d2a31.jpg`) return `${site}/themes/lilyum/logo-refined-v1.webp`;
    return url.toString();
  }
  if (url.origin === site && /^\/themes\/(?:lilyum|alpler|siora|guzide)\/[A-Za-z0-9/_-]+\.(?:png|jpg|jpeg|webp|svg)$/u.test(url.pathname)) return url.toString();
  return undefined;
}
function color(value: string): string { return /^#[a-fA-F0-9]{6}$/u.test(value) ? value : "#292524"; }
function contrast(value: string): string {
  const rgb = [1,3,5].map(i => Number.parseInt(value.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]! > .179 ? "#171717" : "#FFFFFF";
}
export function renderNativeMarketingEmail(input: NativeMarketingTemplateInput): Readonly<{ subject: string; html: string; text: string }> {
  if (!UUID.test(input.storeId)) invalid();
  const p = input.projection, site = origin(p.storefrontOrigin), t = p.template;
  if (!NATIVE_MARKETING_TEMPLATE_DEFAULTS.some(item => item.id === t.id) || !Number.isSafeInteger(t.version) || t.version < 1 || !Array.isArray(p.items) || p.items.length > 12) invalid();
  const subject = text(t.subject, 250), heading = text(t.heading, 160), body = text(t.body, 4_000, true), button = text(t.buttonLabel, 80), storeName = text(p.storeName, 160);
  const normalAction = sameSite(text(t.buttonPath, 1_024), site);
  let unsubscribe: URL; try { unsubscribe = new URL(input.unsubscribeUrl); } catch { return invalid(); }
  if (unsubscribe.protocol !== "https:" || unsubscribe.username || unsubscribe.password || unsubscribe.port || unsubscribe.pathname !== "/api/marketing/unsubscribe" || unsubscribe.searchParams.size !== 1 || !/^[A-Za-z0-9_-]{43}$/u.test(unsubscribe.searchParams.get("token") ?? "") || unsubscribe.hash) invalid();
  let action = normalAction;
  if (p.recoveryNeeded) {
    if (!input.recoveryUrl) invalid(); action = sameSite(input.recoveryUrl, site);
    const url = new URL(action); if (url.pathname !== "/cart/recover" || url.search || !/^#token=[A-Za-z0-9_-]{43}$/u.test(url.hash)) invalid();
  }
  const address = p.postalAddress ? text(p.postalAddress, 500) : input.postalAddress ? `Celebix işletmecisi: ${text(input.postalAddress, 500)}` : "Gönderici adresi test önizlemesinde gösterilmiyor.";
  const accent = color(p.primaryColor), logo = image(p.logoUrl, input.storeId, site), support = sameSite(p.supportUrl, site);
  const greeting = p.recipientName ? `Merhaba ${text(p.recipientName, 160)},` : "Merhaba,";
  const itemTexts: string[] = [];
  const items = p.items.map(item => {
    const title = text(item.productName, 200), url = sameSite(item.url, site);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9_999 || !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0 || !/^[A-Z]{3}$/u.test(item.currency)) invalid();
    const price = new Intl.NumberFormat("tr-TR", { style: "currency", currency: item.currency }).format(item.unitPriceCents / 100), media = image(item.imageUrl, input.storeId, site);
    itemTexts.push(`${title}${t.id === "cart" ? ` × ${item.quantity}` : ""} · ${price}\n${url}`);
    return `<tr><td style="padding:16px 0;border-top:1px solid #e7e5e4">${media ? `<a href="${escape(url)}"><img src="${escape(media)}" alt="" width="80" style="display:block;border:0;border-radius:8px;margin-bottom:10px"></a>` : ""}<a href="${escape(url)}" style="font-size:15px;font-weight:bold;color:#292524;text-decoration:none">${escape(title)}</a><p style="margin:6px 0 0;font-size:14px;color:#57534e">${escape(price)}${t.id === "cart" ? ` · ${item.quantity} adet` : ""}</p></td></tr>`;
  }).join("");
  const textBody = `${storeName}\n\n${greeting}\n\n${heading}\n\n${body}\n\n${itemTexts.join("\n\n")}${itemTexts.length ? "\n\n" : ""}${button}: ${action}\n\n${storeName} mağazasından e-posta alma tercihiniz nedeniyle gönderildi.\n${address}\nMağaza: ${site}\nİletişim: ${support}\nBu mağazanın pazarlama e-postalarını kapat: ${input.unsubscribeUrl}`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#f5f5f4;color:#292524;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px"><tr><td style="padding:32px">${logo ? `<a href="${escape(site)}"><img src="${escape(logo)}" alt="${escape(storeName)}" width="160" style="display:block;width:auto;max-width:160px;height:auto;max-height:64px;border:0"></a>` : `<a href="${escape(site)}" style="font-size:22px;font-weight:bold;color:#292524;text-decoration:none">${escape(storeName)}</a>`}<p style="margin:32px 0 12px;font-size:15px;color:#57534e">${escape(greeting)}</p><h1 style="font-size:30px;line-height:1.25;margin:0 0 18px">${escape(heading)}</h1><p style="font-size:16px;line-height:1.7;margin:0 0 24px">${escape(body).replaceAll("\n", "<br>")}</p>${items ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>` : ""}<p style="margin:28px 0 32px"><a href="${escape(action)}" style="display:inline-block;padding:15px 24px;background:${accent};color:${contrast(accent)};border-radius:8px;font-size:15px;font-weight:bold;text-decoration:none">${escape(button)}</a></p><div style="border-top:1px solid #e7e5e4;padding-top:20px;font-size:12px;line-height:1.7;color:#78716c"><p>${escape(storeName)} mağazasından e-posta alma tercihiniz nedeniyle gönderildi.<br>${escape(address)}</p><p><a href="${escape(site)}" style="color:#57534e">Mağaza</a> · <a href="${escape(support)}" style="color:#57534e">İletişim</a></p><a href="${escape(input.unsubscribeUrl)}" style="color:#57534e;text-decoration:underline">Bu mağazanın pazarlama e-postalarını kapat</a></div></td></tr></table></td></tr></table></body></html>`;
  return Object.freeze({ subject, html, text: textBody });
}
