import { getCommercialPackage } from '../commercial-packages/catalog.ts';
import type { PlanEntitlements } from '../types.ts';

export type WhatsAppOrderConfig = Readonly<{schemaVersion:1;enabled:boolean;phone:string;hidePrices:boolean;hideAddToCart:boolean;messageIntro:string}>;
export type StorefrontCommercePolicy = WhatsAppOrderConfig & Readonly<{checkoutAllowed:boolean;version:number}>;
export function createDefaultWhatsAppOrderConfig(): WhatsAppOrderConfig {
 return Object.freeze({schemaVersion:1,enabled:false,phone:'',hidePrices:false,hideAddToCart:false,messageIntro:'Merhaba, aşağıdaki ürünler için sipariş talebim var.'});
}
function invalid():never {throw new TypeError('whatsapp_order_config_invalid');}
const KEYS=['schemaVersion','enabled','phone','hidePrices','hideAddToCart','messageIntro'];
const UNSAFE=/[\u0000-\u001f\u007f-\u009f<>]|(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u;
export function parseWhatsAppOrderConfig(value:unknown):WhatsAppOrderConfig {
 if(typeof value!=='object'||value===null||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)invalid();
 const own=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value);
 if(own.length!==KEYS.length||own.some(key=>typeof key!=='string'||!KEYS.includes(key)||!descriptors[key]?.enumerable||!('value' in descriptors[key]!)))invalid();
 const r=value as Record<string,unknown>;
 if(r.schemaVersion!==1||typeof r.enabled!=='boolean'||typeof r.hidePrices!=='boolean'||typeof r.hideAddToCart!=='boolean'||typeof r.phone!=='string'||typeof r.messageIntro!=='string')invalid();
 if((r.enabled||r.phone!=='')&&!/^\+[1-9][0-9]{6,14}$/u.test(r.phone))invalid();
 if(r.messageIntro.trim()!==r.messageIntro||Array.from(r.messageIntro).length>300||UNSAFE.test(r.messageIntro)||/(?:https?:|www\.|\/\/)/iu.test(r.messageIntro))invalid();
 return Object.freeze({schemaVersion:1,enabled:r.enabled,phone:r.phone,hidePrices:r.hidePrices,hideAddToCart:r.hideAddToCart,messageIntro:r.messageIntro});
}
export function resolveStorefrontCommercePolicy(config:WhatsAppOrderConfig|null|undefined,version=0):StorefrontCommercePolicy {
 if(!Number.isSafeInteger(version)||version<0)invalid();
 const parsed=parseWhatsAppOrderConfig(config??createDefaultWhatsAppOrderConfig());
 return Object.freeze({...parsed,hidePrices:parsed.enabled&&parsed.hidePrices,hideAddToCart:parsed.enabled&&parsed.hideAddToCart,checkoutAllowed:!parsed.enabled||(!parsed.hidePrices&&!parsed.hideAddToCart),version});
}
/** Additional capability grant; immutable tariff snapshots and manual sales rights are unchanged. */
export function hasWhatsAppOrderingAccess(entitlements:PlanEntitlements):boolean {
 const plan=getCommercialPackage(entitlements);
 return entitlements.status==='active'&&Boolean(plan&&plan.code!=='free_starter'&&plan.monthlyPriceCents>0)&&entitlements.features.includes('catalog')&&entitlements.features.includes('orders');
}
