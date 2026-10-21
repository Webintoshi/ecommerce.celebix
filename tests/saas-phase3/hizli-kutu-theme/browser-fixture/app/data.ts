import { parsePublicStorefront, parsePublicStorefrontDesign, type PublicProduct } from "@celebix/saas-contracts";
import type { CampaignHomeProjection } from "@celebix/saas-data";
import live from "./live-snapshot.json";
export const storefront = parsePublicStorefront(live.storefront);
export const design = parsePublicStorefrontDesign(live.design);
export const projection = live.projection as unknown as CampaignHomeProjection;
export const presentation = projection.presentation;
// Loopback-only QA records; never imported into a merchant database.
export const products: PublicProduct[] = Array.from({length:30},(_,index)=>({id:`20000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,slug:`kontrol-urunu-${index+1}`,title:`Kontrol ürünü ${index+1}`,status:"active",currency:"TRY",available:true,priceCents:450000,description:"<p>Yerel arayüz kontrolü için ürün açıklaması.</p>",media:[],variants:[
{id:`30000000-0000-4000-8000-${String(index*2+1).padStart(12,'0')}`,title:"28 cm / 250 adet",sku:"K-250",priceCents:450000,available:true,stockTracking:true,stockQuantity:9,attributes:{"Ölçü":"28 cm","Paket içi adet":"250"}},
{id:`30000000-0000-4000-8000-${String(index*2+2).padStart(12,'0')}`,title:"30 cm / 500 adet",sku:"K-500",priceCents:800000,available:true,stockTracking:true,stockQuantity:9,attributes:{"Ölçü":"30 cm","Paket içi adet":"500"}}]}));

// Exercise real gallery layout/zoom with plain uploaded placeholders, including
// selection-bound media. These records remain loopback-only.
const qaMedia = live.projection.presentation.sections.find((s: any) => s.kind === "banner") as any;
if (qaMedia) products[0] = { ...products[0], media: [0, 1].map((n) => ({
  id: `40000000-0000-4000-8000-${String(n+1).padStart(12,"0")}`, productId: products[0].id,
  ...qaMedia.slides[0].desktopImage, altText: `Placeholder ${n+1}`, sortOrder: n,
})), variants: products[0].variants.map((variant, n) => ({ ...variant, mediaIds: n === 0 ? ["40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000002"] : ["40000000-0000-4000-8000-000000000002"] })) };
