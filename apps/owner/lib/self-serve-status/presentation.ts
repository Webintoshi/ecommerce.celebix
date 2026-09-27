import {createCanonicalAdminOriginFromPanelOrigin,normalizeExactHttpsOrigin} from "../../../../packages/saas-data/src/panel-origin.ts";
import type {RegistrationAuthorityScope} from "../onboarding-jobs/types.ts";
import type {OnboardingStage,OnboardingStatusDto,OnboardingStatusProjection} from "./types.ts";
const STAGES:readonly OnboardingStage[]=["awaiting_identity","creating","checking_access","ready","attention_required","expired","failed"];
export function parseStatusProjection(value:unknown):OnboardingStatusProjection {
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("onboarding_status_projection_invalid");
 const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!["stage","updatedAt","storeSlug"].includes(key))||!STAGES.includes(row.stage as OnboardingStage)||typeof row.updatedAt!=="string"||!Number.isFinite(Date.parse(row.updatedAt))||new Date(row.updatedAt).toISOString()!==row.updatedAt)throw new Error("onboarding_status_projection_invalid");
 if(row.stage==="ready"?(typeof row.storeSlug!=="string"||!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(row.storeSlug)):row.storeSlug!==undefined)throw new Error("onboarding_status_projection_invalid");
 return Object.freeze({stage:row.stage as OnboardingStage,updatedAt:row.updatedAt,...(row.storeSlug===undefined?{}:{storeSlug:row.storeSlug as string})});
}
export function presentOnboardingStatus(value:OnboardingStatusProjection,rawScope:RegistrationAuthorityScope):OnboardingStatusDto {
 const scope=rawScope;
 if(normalizeExactHttpsOrigin(scope.ownerOrigin)!==scope.ownerOrigin||normalizeExactHttpsOrigin(scope.panelOrigin)!==scope.panelOrigin||!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(scope.platformDomainSuffix))throw new Error("onboarding_status_scope_invalid");const projection=parseStatusProjection(value);
 const pollAfterMs=["awaiting_identity","creating","checking_access"].includes(projection.stage)?5000:0;
 return Object.freeze({stage:projection.stage,updatedAt:projection.updatedAt,pollAfterMs,messageCode:`onboarding_${projection.stage}`,...(projection.stage==="ready"?{
 loginUrl:`${scope.panelOrigin}/auth/login?destination=${new URL(createCanonicalAdminOriginFromPanelOrigin(scope.panelOrigin,projection.storeSlug!)).hostname}`,
 storefrontUrl:`https://${projection.storeSlug}.${scope.platformDomainSuffix}`}:{})});
}
export function parseOnboardingStatusDto(value:unknown,scope:RegistrationAuthorityScope):OnboardingStatusDto {
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("onboarding_status_dto_invalid");
 const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!["stage","updatedAt","pollAfterMs","messageCode","loginUrl","storefrontUrl"].includes(key)))throw new Error("onboarding_status_dto_invalid");
 let storeSlug:string|undefined;
 if(row.stage==="ready") {
  if(typeof row.storefrontUrl!=="string")throw new Error("onboarding_status_dto_invalid");
  const url=new URL(row.storefrontUrl);const suffix=`.${scope.platformDomainSuffix}`;if(!url.hostname.endsWith(suffix))throw new Error("onboarding_status_dto_invalid");storeSlug=url.hostname.slice(0,-suffix.length);
 }
 const expected=presentOnboardingStatus({stage:row.stage as OnboardingStage,updatedAt:row.updatedAt as string,...(storeSlug?{storeSlug}:{})},scope);
 if(Object.keys(expected).length!==Object.keys(row).length||Object.entries(expected).some(([key,val])=>row[key]!==val))throw new Error("onboarding_status_dto_invalid");return expected;
}
export function nextStatusPollDelay(status:OnboardingStatusDto|undefined,hidden:boolean):number {return hidden?0:status?.pollAfterMs??15000;}
export const STATUS_MESSAGES:Readonly<Record<OnboardingStage,string>>=Object.freeze({awaiting_identity:"Hesap doğrulaması bekleniyor.",creating:"Mağazanız hazırlanıyor.",checking_access:"Mağaza adresleriniz kontrol ediliyor.",ready:"Mağazanız hazır.",attention_required:"Mağazanızın kurulumu için destek gerekiyor.",expired:"Kayıt doğrulama süresi doldu.",failed:"Kayıt tamamlanamadı."});
