import {resolvePublicProductVariantMedia,type PublicProduct} from '@celebix/saas-contracts';
export function merchantLandingProduct(product:PublicProduct,params:Readonly<Record<string,string|string[]|undefined>>):Readonly<{product:PublicProduct;variantId?:string;imageUrls?:readonly string[]}>{
 const id=params.variant;if(id===undefined)return {product};
 if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw TypeError('merchant_variant_invalid');
 const variant=product.variants.find(v=>v.id===id);if(!variant)throw TypeError('merchant_variant_invalid');
 const media=resolvePublicProductVariantMedia(product,id);
 return {variantId:id,imageUrls:(media.length?media:product.media).map(m=>m.url),product:{...product,priceCents:variant.priceCents,compareAtCents:variant.compareAtCents}};
}
