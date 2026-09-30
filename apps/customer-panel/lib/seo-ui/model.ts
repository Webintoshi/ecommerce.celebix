import type { SeoNotification, SeoResourceKind } from '@celebix/saas-contracts';
export type MutationIdentity = Readonly<{ fingerprint:string;key:string }>;
export function mutationIdentity(previous:MutationIdentity|null,path:string,payload:unknown,uuid:()=>string=()=>crypto.randomUUID()):MutationIdentity {
 const fingerprint=JSON.stringify([path,payload]);return previous?.fingerprint===fingerprint?previous:{fingerprint,key:uuid()};
}
export const RESOURCE_KINDS:readonly SeoResourceKind[]=['product','category','page','blog'];
export const RESOURCE_LABELS:Record<SeoResourceKind,string>={product:'Ürünler',category:'Kategoriler',page:'Sayfalar',blog:'Blog'};
export function notificationLabel(value:Pick<SeoNotification,'status'|'httpStatus'>):string {
 const labels={queued:'Sırada',received:'IndexNow aldı',verification_pending:'Anahtar doğrulaması bekleniyor',retrying:'Tekrar denenecek',failed:'Gönderilemedi'};
 return `${labels[value.status]}${value.httpStatus?` · HTTP ${value.httpStatus}`:''}`;
}
export function legacySeoDestination(route:string,resourceId?:string|null):string {
 const kind=({products:'product',categories:'category',pages:'page',content:'blog'} as Record<string,SeoResourceKind>)[route];
 if(kind){const params=new URLSearchParams({kind});if(resourceId&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resourceId))params.set('resourceId',resourceId);return `/seo/content?${params}`;}
 return route==='sitemap'?'/seo?tab=sitemap':route==='internal-linking'?'/seo?tab=links':route==='fast-indexing'?'/seo?tab=notifications':'/seo/settings';
}
export function nullable(value:FormDataEntryValue|null):string|null {return typeof value==='string'&&value.trim()?value.trim():null;}
export function safeFixHref(value:string):string {return /^\/seo(?:[/?]|$)/.test(value)&&!/[\r\n\\]/.test(value)?value:'/seo/content';}
