import type {LoyaltyCustomerAction,LoyaltyCustomerPayloadMap,LoyaltyCustomerResultMap} from '@celebix/saas-contracts';
import type {LoyaltyCustomerRepository} from '@celebix/saas-data';
import {accountCredentialDigestCandidates,readAccountCookie,type StorefrontIdentityKeyring} from './credential.ts';

export class AccountLoyaltyError extends Error {constructor(readonly code:string){super(code);this.name='AccountLoyaltyError';}}
export type AccountLoyaltyRuntime=Readonly<{command<A extends LoyaltyCustomerAction>(input:Readonly<{hostname:string;cookieHeader:string|null;action:A;payload:LoyaltyCustomerPayloadMap[A];operationId?:string}>):Promise<LoyaltyCustomerResultMap[A]>}>;
export function createAccountLoyaltyRuntime({repository,keyring,now}:Readonly<{repository:LoyaltyCustomerRepository;keyring:StorefrontIdentityKeyring;now():Date}>):AccountLoyaltyRuntime{
 return Object.freeze({async command(input){
  const cookie=readAccountCookie(input.cookieHeader),candidates=cookie.kind==='present'?accountCredentialDigestCandidates(cookie.value,keyring):[];
  if(!candidates.length)throw new AccountLoyaltyError('unauthenticated');
  return repository.command({hostname:input.hostname,now:now(),candidates,action:input.action,payload:input.payload,...(input.operationId?{operationId:input.operationId}:{})});
 }});
}
