import { isNativeMarketingBlockContent, nativeMarketingProductIds, parseNativeMarketingContent } from "./document.ts";
import type { NativeMarketingBlockContent, NativeMarketingProjection, NativeMarketingTemplate } from "./types.ts";

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
function renderLegacyNativeMarketingEmail(input: NativeMarketingTemplateInput): Readonly<{ subject: string; html: string; text: string }> {
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

function renderBlockNativeMarketingEmail(input: NativeMarketingTemplateInput, content: NativeMarketingBlockContent): Readonly<{ subject: string; html: string; text: string }> {
  const p = input.projection, t = p.template, site = origin(p.storefrontOrigin);
  if (!UUID.test(input.storeId) || !NATIVE_MARKETING_TEMPLATE_DEFAULTS.some(item => item.id === t.id) || t.id === 'cart' || p.recoveryNeeded || !Number.isSafeInteger(t.version) || t.version < 1 || !Array.isArray(p.items)) invalid();
  // Parse only content: id/version belong to the template envelope, never to the document.
  parseNativeMarketingContent(content);
  const productIds = nativeMarketingProductIds(content);
  if (p.items.length !== productIds.length || p.items.some((item, index) => item.productId !== productIds[index])) invalid();
  const assetIds = [...new Set(content.blocks.flatMap(block => block.type === 'image' || block.type === 'image_text' ? [block.assetId] : []))];
  const images = new Map<string, string>();
  if (p.blockImages !== undefined && (!Array.isArray(p.blockImages) || p.blockImages.length > 20)) invalid();
  for (const projected of p.blockImages ?? []) {
    if (!UUID.test(projected.assetId) || images.has(projected.assetId) || !assetIds.includes(projected.assetId)) invalid();
    let assetUrl: URL; try { assetUrl = new URL(projected.url); } catch { return invalid(); }
    if (assetUrl.protocol !== 'https:' || !MEDIA.has(assetUrl.hostname) || assetUrl.username || assetUrl.password || assetUrl.port || assetUrl.search || assetUrl.hash || !assetUrl.pathname.startsWith(`/stores/${input.storeId}/`) || /%|\.\./u.test(projected.url)) invalid();
    images.set(projected.assetId, assetUrl.toString());
  }
  if (assetIds.some(id => !images.has(id))) invalid();
  const storeName = text(p.storeName, 160), support = sameSite(p.supportUrl, site), logo = image(p.logoUrl, input.storeId, site), accent = color(p.primaryColor);
  const greeting = p.recipientName ? `Merhaba ${text(p.recipientName, 160)},` : 'Merhaba,';
  const address = p.postalAddress ? text(p.postalAddress, 500) : input.postalAddress ? `Celebix işletmecisi: ${text(input.postalAddress, 500)}` : 'Gönderici adresi test önizlemesinde gösterilmiyor.';
  let unsubscribe: URL; try { unsubscribe = new URL(input.unsubscribeUrl); } catch { return invalid(); }
  if (unsubscribe.protocol !== 'https:' || unsubscribe.username || unsubscribe.password || unsubscribe.port || unsubscribe.pathname !== '/api/marketing/unsubscribe' || unsubscribe.searchParams.size !== 1 || !/^[A-Za-z0-9_-]{43}$/u.test(unsubscribe.searchParams.get('token') ?? '') || unsubscribe.hash) invalid();
  const multiline = (value: string) => escape(value).replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '<br>');
  const button = (label: string, path: string, background: string) => `<a href="${escape(sameSite(path, site))}" style="display:inline-block;padding:15px 24px;background:${background};color:${contrast(background)};border-radius:8px;font-size:15px;font-weight:bold;text-decoration:none;max-width:100%;box-sizing:border-box">${escape(label)}</a>`;
  const media = (assetId: string, alt: string) => `<img src="${escape(images.get(assetId)!)}" alt="${escape(alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:8px">`;
  const plain: string[] = [];
  const blocks = content.blocks.map(block => {
    switch (block.type) {
      case 'heading': {
        plain.push(block.text);
        const size = { small: 22, medium: 26, large: 30 }[block.size];
        return `<h1 style="margin:0 0 18px;font-size:${size}px;line-height:1.25;color:${block.color};text-align:${block.align};overflow-wrap:anywhere">${multiline(block.text)}</h1>`;
      }
      case 'text': plain.push(block.text); return `<p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:${block.color};text-align:${block.align};overflow-wrap:anywhere">${multiline(block.text)}</p>`;
      case 'image': {
        plain.push([block.alt, block.linkPath ? sameSite(block.linkPath, site) : ''].filter(Boolean).join('\n'));
        const img = media(block.assetId, block.alt);
        return `<div style="margin:0 0 24px">${block.linkPath ? `<a href="${escape(sameSite(block.linkPath, site))}">${img}</a>` : img}</div>`;
      }
      case 'image_text': {
        plain.push(`${block.heading}\n\n${block.text}\n\n${block.buttonLabel}: ${sameSite(block.buttonPath, site)}`);
        const img = `<td class="email-stack" width="50%" valign="top" style="padding:0 8px 16px">${media(block.assetId, block.alt)}</td>`;
        const copy = `<td class="email-stack" width="50%" valign="top" style="padding:0 8px 16px"><h2 style="margin:0 0 12px;font-size:22px;line-height:1.3;overflow-wrap:anywhere">${multiline(block.heading)}</h2><p style="margin:0 0 18px;font-size:16px;line-height:1.7;overflow-wrap:anywhere">${multiline(block.text)}</p>${button(block.buttonLabel, block.buttonPath, accent)}</td>`;
        return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;margin:0 0 8px"><tr>${block.imagePosition === 'left' ? img + copy : copy + img}</tr></table>`;
      }
      case 'products': {
        const cells = block.productIds.map(id => {
          const item = p.items.find(item => item.productId === id)!;
          const title = text(item.productName, 200), url = sameSite(item.url, site), img = image(item.imageUrl, input.storeId, site);
          if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999 || !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0 || !/^[A-Z]{3}$/u.test(item.currency)) invalid();
          const price = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: item.currency }).format(item.unitPriceCents / 100);
          plain.push(`${title} · ${price}\n${url}`);
          return `<td class="email-stack" width="${100 / block.columns}%" valign="top" style="padding:12px 8px 20px;overflow-wrap:anywhere">${img ? `<a href="${escape(url)}"><img src="${escape(img)}" alt="" width="240" style="display:block;width:100%;max-width:240px;height:auto;border:0;border-radius:8px;margin-bottom:10px"></a>` : ''}<a href="${escape(url)}" style="font-size:15px;font-weight:bold;color:#292524;text-decoration:none">${escape(title)}</a><p style="margin:6px 0 0;font-size:14px;color:#57534e">${escape(price)}</p></td>`;
        });
        const rows: string[] = []; for (let i = 0; i < cells.length; i += block.columns) rows.push(`<tr>${cells.slice(i, i + block.columns).join('')}</tr>`);
        return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;margin-bottom:16px">${rows.join('')}</table>`;
      }
      case 'button': plain.push(`${block.label}: ${sameSite(block.path, site)}`); return `<p style="margin:4px 0 28px;text-align:${block.align}">${button(block.label, block.path, block.color)}</p>`;
      case 'banner': plain.push(`${block.heading}\n\n${block.text}`); return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px"><tr><td style="padding:24px;background:${block.backgroundColor};color:${block.textColor};border-radius:8px;overflow-wrap:anywhere"><h2 style="margin:0 0 12px;font-size:24px;line-height:1.3">${multiline(block.heading)}</h2><p style="margin:0;font-size:16px;line-height:1.7">${multiline(block.text)}</p></td></tr></table>`;
      case 'divider': return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px"><tr><td style="height:1px;border-top:1px solid ${block.color};font-size:0;line-height:0">&nbsp;</td></tr></table>`;
      case 'spacer': return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td height="${block.height}" style="height:${block.height}px;font-size:0;line-height:0">&nbsp;</td></tr></table>`;
    }
  }).join('');
  const textBody = `${storeName}\n\n${greeting}\n\n${plain.filter(Boolean).join('\n\n')}\n\n${storeName} mağazasından e-posta alma tercihiniz nedeniyle gönderildi.\n${address}\nMağaza: ${site}\nİletişim: ${support}\nBu mağazanın pazarlama e-postalarını kapat: ${input.unsubscribeUrl}`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(content.subject)}</title><style>@media only screen and (max-width:480px){.email-stack{display:block!important;width:100%!important;box-sizing:border-box}.email-content{padding:24px 16px!important}}</style></head><body style="margin:0;background:#f5f5f4;color:#292524;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px"><tr><td class="email-content" style="padding:32px">${logo ? `<a href="${escape(site)}"><img src="${escape(logo)}" alt="${escape(storeName)}" width="160" style="display:block;width:auto;max-width:160px;height:auto;max-height:64px;border:0"></a>` : `<a href="${escape(site)}" style="font-size:22px;font-weight:bold;color:#292524;text-decoration:none">${escape(storeName)}</a>`}<p style="margin:32px 0 24px;font-size:15px;color:#57534e">${escape(greeting)}</p>${blocks}<div style="border-top:1px solid #e7e5e4;padding-top:20px;font-size:12px;line-height:1.7;color:#78716c"><p>${escape(storeName)} mağazasından e-posta alma tercihiniz nedeniyle gönderildi.<br>${escape(address)}</p><p><a href="${escape(site)}" style="color:#57534e">Mağaza</a> · <a href="${escape(support)}" style="color:#57534e">İletişim</a></p><a href="${escape(input.unsubscribeUrl)}" style="color:#57534e;text-decoration:underline">Bu mağazanın pazarlama e-postalarını kapat</a></div></td></tr></table></td></tr></table></body></html>`;
  return Object.freeze({ subject: content.subject, html, text: textBody });
}
export function renderNativeMarketingEmail(input: NativeMarketingTemplateInput): Readonly<{ subject: string; html: string; text: string }> {
  const template = input.projection.template;
  if (!('schemaVersion' in template)) return renderLegacyNativeMarketingEmail(input);
  const { id: _id, version: _version, ...value } = template;
  const content = parseNativeMarketingContent(value);
  if (!isNativeMarketingBlockContent(content)) invalid();
  return renderBlockNativeMarketingEmail(input, content);
}
