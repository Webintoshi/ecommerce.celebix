import { formatTry } from './format.ts';
export type WhatsAppOrderMessageLine = Readonly<{title:string;variantTitle:string;slug:string;quantity:number;unitPriceCents:number|null;available:boolean}>;
export function buildWhatsAppOrderMessage(input: Readonly<{storeName:string;origin:string;intro:string;hidePrices:boolean;lines:readonly WhatsAppOrderMessageLine[]}>): string {
  const origin = new URL(input.origin);
  if (!['https:','http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !input.lines.length) throw new TypeError('whatsapp_order_invalid');
  const lines=input.lines.map(line=>{
    if (!line.available || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 9999 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(line.slug)) throw new TypeError('whatsapp_order_invalid');
    if (!input.hidePrices && (line.unitPriceCents === null || !Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0)) throw new TypeError('whatsapp_order_invalid');
    return `${line.title}${line.variantTitle && line.variantTitle !== 'Varsayılan' ? ` — ${line.variantTitle}` : ''} — ${line.quantity} adet${!input.hidePrices ? `\nBirim fiyat: ${formatTry(line.unitPriceCents)}` : ''}\nÜrün bağlantısı: ${origin.origin}/products/${line.slug}`;
  });
  return `${input.intro}\n${input.storeName} mağazanızdaki aşağıdaki ürünler için sipariş talebim var.\n\n${lines.join('\n\n')}\n\nFiyat ve teslimat bilgisini paylaşır mısınız?`;
}
/** Stay below conservative browser/app URL limits; preserve the full message for copying. */
export function whatsappOrderDestination(phone: string, message: string) {
  if (!/^\+?[1-9]\d{6,14}$/.test(phone)) throw new TypeError('whatsapp_order_phone_invalid');
  const base=`https://wa.me/${phone.replace(/^\+/, "")}`;const full=`${base}?text=${encodeURIComponent(message)}`;
  return Object.freeze({url:full.length>2000?base:full,message,requiresCopy:full.length>2000});
}
