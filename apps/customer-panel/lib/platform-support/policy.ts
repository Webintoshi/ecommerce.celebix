import type { TenantContext } from '@celebix/saas-contracts';
import type { PanelSession } from '../session.ts';
export const SUPPORT_COOKIE_NAME='__Host-celebix_support';
export type SupportSidecar=Readonly<{id:string;operatorId:string;principalId:string;storeId:string;adminHost:string;reason:string;operatorLabel:string;issuedAt:string;expiresAt:string;revokedAt:string|null;version:number}>;
export type SupportAccess=Readonly<{kind:'authenticated';session:Readonly<PanelSession>;tenantContext:TenantContext;support:SupportSidecar}>|Readonly<{kind:'unauthorized'|'unavailable'}>;
export function readSupportCookie(header:string|null):Readonly<{kind:'missing'|'invalid'}|{kind:'present';credential:string}>{
 if(header===null)return {kind:'missing'};
 if(new TextEncoder().encode(header).byteLength>8192||/[\u0000-\u001f\u007f]/.test(header))return {kind:'invalid'};
 const values=header.split(';').map(v=>v.trim()).filter(v=>v.startsWith(SUPPORT_COOKIE_NAME+'='));
 if(!values.length)return {kind:'missing'};
 const token=values[0]!.slice(SUPPORT_COOKIE_NAME.length+1);
 if(values.length!==1||!(/^[a-f0-9]{64}$/).test(token))return {kind:'invalid'};
 return {kind:'present',credential:'support:'+token};
}
export function supportCookie(token:string,maxAge:number):string{
 if(token!==''&&!(/^[a-f0-9]{64}$/).test(token))throw Error('support_credential_invalid');
 return `${SUPPORT_COOKIE_NAME}=${token}; Path=/; Max-Age=${Math.max(0,Math.min(1800,Math.floor(maxAge)))}; HttpOnly; Secure; SameSite=Strict`;
}
export function supportAccess(value:unknown,host:string,now:Date):SupportAccess{
 if(!value||typeof value!=='object')return {kind:'unauthorized'};
 const {support,tenantContext}=value as {support:SupportSidecar;tenantContext:TenantContext};
 const issued=Date.parse(support?.issuedAt),expires=Date.parse(support?.expiresAt);
 if(!support||!tenantContext||tenantContext.schemaVersion!==1||tenantContext.entitlements?.schemaVersion!==1||tenantContext.entitlements.status!=='active'||!Number.isSafeInteger(tenantContext.entitlements.version)||tenantContext.entitlements.version<1||!Array.isArray(tenantContext.entitlements.features)||!tenantContext.entitlements.limits||!Number.isFinite(issued)||!Number.isFinite(expires)||expires-issued!==1800000||issued>now.getTime()||expires<=now.getTime()||support.revokedAt!==null||support.adminHost!==host||support.principalId!==tenantContext.principal?.id||support.storeId!==tenantContext.store?.id||tenantContext.membership?.role!=='admin'||tenantContext.membership.status!=='active'||tenantContext.store.status!=='active'||Object.keys(tenantContext).some(k=>!['schemaVersion','requestId','principal','store','membership','entitlements','locale','resolvedHost'].includes(k)))return {kind:'unauthorized'};
 return Object.freeze({kind:'authenticated',support:Object.freeze(support),tenantContext:Object.freeze(tenantContext),session:Object.freeze({id:support.id,principal:tenantContext.principal,activeStoreId:support.storeId,createdAt:support.issuedAt,rotatedAt:support.issuedAt,expiresAt:support.expiresAt})});
}
