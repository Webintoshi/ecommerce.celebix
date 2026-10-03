import type {PlatformOperatorContext} from '../../../../packages/saas-contracts/src/platform/types.ts';

export interface PlatformRegistryRecord {operatorId:string;principalId:string;issuer:string;subject:string;active:boolean;label:string;version:number}
export type PlatformIdentityDecision=Readonly<{kind:'unauthenticated'|'unverified'|'forbidden'|'mfa_required'}>|Readonly<{kind:'authorized';operator:PlatformOperatorContext}>;
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function classifyPlatformIdentity(
 user:Readonly<{id:string;email?:string|null;email_confirmed_at?:string|null;[key:string]:unknown}>|null,
 verifiedClaims:Readonly<Record<string,unknown>>|null,
 registry:PlatformRegistryRecord|null,
 expectedIssuer:string,
):PlatformIdentityDecision {
 if(!user||!verifiedClaims)return {kind:'unauthenticated'};
 if(!user.email_confirmed_at||!user.email)return {kind:'unverified'};
 if(verifiedClaims.iss!==expectedIssuer||verifiedClaims.sub!==user.id||verifiedClaims.aud!=='authenticated')return {kind:'forbidden'};
 if(!registry?.active||registry.issuer!==expectedIssuer||registry.subject!==user.id||!uuid.test(registry.operatorId)||!uuid.test(registry.principalId))return {kind:'forbidden'};
 const passwordAuthenticated=Array.isArray(verifiedClaims.amr)&&verifiedClaims.amr.some(method=>method&&typeof method==='object'&&(method as {method?:unknown}).method==='password');
 if(verifiedClaims.aal!=='aal2'||!passwordAuthenticated)return {kind:'mfa_required'};
 return {kind:'authorized',operator:Object.freeze({operatorId:registry.operatorId,principalId:registry.principalId,issuer:registry.issuer,subject:registry.subject,email:user.email,label:registry.label||user.email,assuranceLevel:'aal2'})};
}
