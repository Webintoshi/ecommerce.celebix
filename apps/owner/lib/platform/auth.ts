import 'server-only';
import {redirect} from 'next/navigation';
import type {PlatformOperatorContext} from '@celebix/saas-contracts';
import {createOwnerServerClient} from '../owner-supabase-server.ts';
import {getMissingOwnerSupabaseEnvNames,getOwnerSupabaseUrl} from '../owner-supabase-shared.ts';
import {classifyPlatformIdentity,type PlatformIdentityDecision} from './authority.ts';
import {resolvePlatformRegistry} from './database.ts';

export async function resolvePlatformIdentity():Promise<PlatformIdentityDecision|Readonly<{kind:'unavailable'}>> {
 if(getMissingOwnerSupabaseEnvNames().length)return {kind:'unavailable'};
 try {
  const supabase=await createOwnerServerClient();
  const [{data,error},{data:claimData,error:claimError}]=await Promise.all([supabase.auth.getUser(),supabase.auth.getClaims()]);
  if(error||claimError||!data.user||!claimData?.claims)return {kind:'unauthenticated'};
  const issuer=`${getOwnerSupabaseUrl()}/auth/v1`;
  const claims=claimData.claims as Record<string,unknown>;
  if(claims.iss!==issuer||claims.sub!==data.user.id)return {kind:'forbidden'};
  const registry=await resolvePlatformRegistry(issuer,data.user.id);
  const decision=classifyPlatformIdentity({...data.user},claims,registry,issuer);
  if(decision.kind==='authorized') {
   const {data:factors,error:factorError}=await supabase.auth.mfa.listFactors();
   if(factorError)return {kind:'unavailable'};
   if(!factors.totp.some(f=>f.status==='verified'))return {kind:'mfa_required'};
  }
  return decision;
 }catch{return {kind:'unavailable'};}
}
export async function getPlatformOperator():Promise<PlatformOperatorContext|null> {
 const result=await resolvePlatformIdentity();return result.kind==='authorized'?result.operator:null;
}
export async function requirePlatformOperator():Promise<PlatformOperatorContext> {
 const result=await resolvePlatformIdentity();
 if(result.kind==='authorized')return result.operator;
 if(result.kind==='mfa_required')redirect('/security');
 if(result.kind==='forbidden'||result.kind==='unverified')redirect('/login?error=platform_access_denied');
 if(result.kind==='unavailable')redirect('/login?error=platform_unavailable');
 redirect('/login');
}
