import type {PlanEntitlements,PlanEntitlementLimits,PlanFeatureKey} from '../types.ts';
import {PLAN_FEATURE_KEYS} from '../types.ts';

export const COMMERCIAL_CAPABILITIES = ['manual_orders','coupons','growth_tools','email_marketing','advanced_analytics','google_connections','google_merchant','seo_tools','cashier','accounting','reference_pricing','ai','custom_domains','staff_management'] as const;
export type CommercialCapability = typeof COMMERCIAL_CAPABILITIES[number];
export type CommercialPackageCode = 'free_starter'|'starter'|'growth'|'professional';
export interface CommercialPackage {
 readonly id:string;
 readonly code:CommercialPackageCode;
 readonly version:number;
 readonly name:string;
 readonly currency:'TRY';
 readonly vatIncluded:false;
 readonly monthlyPriceCents:number;
 readonly annualPriceCents:number;
 readonly features:readonly PlanFeatureKey[];
 readonly limits:Readonly<PlanEntitlementLimits>;
 readonly variantLimit:number;
 readonly capabilities:readonly CommercialCapability[];
}
const CORE:readonly PlanFeatureKey[]=['catalog','orders','customers','content','media','analytics','checkout','integrations'];
const STARTER_V1:readonly CommercialCapability[]=['manual_orders','coupons','google_connections','google_merchant','seo_tools','ai','custom_domains','staff_management'];
const GROWTH_V1:readonly CommercialCapability[]=[...STARTER_V1,'growth_tools','email_marketing','advanced_analytics'];
function plan(input:Omit<CommercialPackage,'currency'|'vatIncluded'>):CommercialPackage {
 return Object.freeze({...input,currency:'TRY',vatIncluded:false,features:Object.freeze(PLAN_FEATURE_KEYS.filter(key=>input.features.includes(key))),limits:Object.freeze({...input.limits}),capabilities:Object.freeze([...input.capabilities])});
}
const HISTORIC_COMMERCIAL_PACKAGES:readonly CommercialPackage[]=Object.freeze([
 plan({id:'00000000-0000-4000-8000-000000000003',code:'free_starter',version:2,name:'Ücretsiz',monthlyPriceCents:0,annualPriceCents:0,features:CORE,limits:{products:100,staff:1,storageBytes:1_000_000_000,monthlyOrders:50,customDomains:0},variantLimit:500,capabilities:[]}),
 plan({id:'00000000-0000-4000-8000-000000000004',code:'starter',version:1,name:'Başlangıç',monthlyPriceCents:199_000,annualPriceCents:1_990_000,features:[...CORE,'custom_domains','staff_management','promotions','marketplaces'],limits:{products:1000,staff:2,storageBytes:5_000_000_000,monthlyOrders:1000,customDomains:4},variantLimit:5000,capabilities:STARTER_V1}),
 plan({id:'00000000-0000-4000-8000-000000000005',code:'growth',version:1,name:'Büyüme',monthlyPriceCents:349_000,annualPriceCents:3_490_000,features:[...CORE,'custom_domains','staff_management','promotions','marketplaces'],limits:{products:5000,staff:5,storageBytes:20_000_000_000,monthlyOrders:5000,customDomains:4},variantLimit:25000,capabilities:GROWTH_V1}),
 plan({id:'00000000-0000-4000-8000-000000000006',code:'professional',version:1,name:'Profesyonel',monthlyPriceCents:599_000,annualPriceCents:5_990_000,features:[...CORE,'custom_domains','staff_management','promotions','marketplaces','accounting'],limits:{products:10000,staff:15,storageBytes:50_000_000_000,monthlyOrders:20000,customDomains:4},variantLimit:50000,capabilities:[...GROWTH_V1,'cashier','accounting','reference_pricing']}),
]);
const STARTER:readonly CommercialCapability[]=Object.freeze(STARTER_V1.filter(capability=>capability!=='manual_orders'));
const GROWTH:readonly CommercialCapability[]=Object.freeze([...STARTER,'growth_tools','email_marketing','advanced_analytics']);
/** Offered tariffs are immutable revisions; old agreements resolve through the history above. */
export const COMMERCIAL_PACKAGES:readonly CommercialPackage[]=Object.freeze([
 plan({id:'00000000-0000-4000-8000-000000000007',code:'free_starter',version:3,name:'Ücretsiz',monthlyPriceCents:0,annualPriceCents:0,features:CORE,limits:{products:25,staff:1,storageBytes:1_000_000_000,monthlyOrders:50,customDomains:0},variantLimit:500,capabilities:[]}),
 plan({id:'00000000-0000-4000-8000-000000000008',code:'starter',version:2,name:'Başlangıç',monthlyPriceCents:258_700,annualPriceCents:2_587_000,features:[...CORE,'custom_domains','staff_management','promotions','marketplaces'],limits:{products:1000,staff:2,storageBytes:5_000_000_000,monthlyOrders:1000,customDomains:4},variantLimit:5000,capabilities:STARTER}),
 plan({id:'00000000-0000-4000-8000-000000000009',code:'growth',version:2,name:'Büyüme',monthlyPriceCents:453_700,annualPriceCents:4_537_000,features:[...CORE,'custom_domains','staff_management','promotions','marketplaces'],limits:{products:5000,staff:5,storageBytes:20_000_000_000,monthlyOrders:5000,customDomains:4},variantLimit:25000,capabilities:GROWTH}),
 plan({id:'00000000-0000-4000-8000-000000000010',code:'professional',version:2,name:'Profesyonel',monthlyPriceCents:778_700,annualPriceCents:7_787_000,features:[...CORE,'custom_domains','staff_management','promotions','marketplaces','accounting'],limits:{products:10000,staff:15,storageBytes:50_000_000_000,monthlyOrders:20000,customDomains:4},variantLimit:50000,capabilities:[...GROWTH,'manual_orders','cashier','accounting','reference_pricing']}),
]);
const ALL_COMMERCIAL_PACKAGES:readonly CommercialPackage[]=Object.freeze([...HISTORIC_COMMERCIAL_PACKAGES,...COMMERCIAL_PACKAGES]);
const CAPABILITY_FEATURE:Readonly<Record<CommercialCapability,PlanFeatureKey>>=Object.freeze({manual_orders:'orders',coupons:'promotions',growth_tools:'promotions',email_marketing:'integrations',advanced_analytics:'analytics',google_connections:'integrations',google_merchant:'marketplaces',seo_tools:'catalog',cashier:'orders',accounting:'accounting',reference_pricing:'catalog',ai:'catalog',custom_domains:'custom_domains',staff_management:'staff_management'});
type PlanIdentity=Pick<PlanEntitlements,'planId'|'planCode'|'version'>;
/** Only an exact immutable identity can select a commercial tariff/policy. */
export function getCommercialPackage(identity:PlanIdentity):CommercialPackage|undefined {
 return ALL_COMMERCIAL_PACKAGES.find(p=>p.id===identity.planId&&p.code===identity.planCode&&p.version===identity.version);
}
export function isCommercialCapability(value:unknown):value is CommercialCapability {
 return typeof value==='string'&&(COMMERCIAL_CAPABILITIES as readonly string[]).includes(value);
}
/** Only the two pre-commercial built-ins retain their legacy broad rights. Unknown identities fail closed. */
export function hasCommercialCapability(entitlements:PlanEntitlements,capability:string):boolean {
 if(entitlements.status!=='active'||!isCommercialCapability(capability))return false;
 if(!entitlements.features.includes(CAPABILITY_FEATURE[capability]))return false;
 const selected=getCommercialPackage(entitlements);
 if(selected)return selected.capabilities.includes(capability);
 return (entitlements.planId==='00000000-0000-4000-8000-000000000001'&&entitlements.planCode==='free_starter'&&entitlements.version===1)
  ||(entitlements.planId==='00000000-0000-4000-8000-000000000002'&&entitlements.planCode==='pilot'&&entitlements.version===1);
}
export function getRequiredCommercialPackage(capability:CommercialCapability):CommercialPackage {
 const selected=COMMERCIAL_PACKAGES.find(p=>p.capabilities.includes(capability));
 if(!selected)throw new TypeError('commercial_capability_invalid');
 return selected;
}
