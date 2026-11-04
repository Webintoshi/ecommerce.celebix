import {accountCredentialDigestCandidates,readAccountCookie,type StorefrontIdentityKeyring} from './credential.ts';

export function checkoutAccountCandidates(cookieHeader:string|null,keyring:StorefrontIdentityKeyring|undefined){
 const account=readAccountCookie(cookieHeader);
 return account.kind==='present'&&keyring?accountCredentialDigestCandidates(account.value,keyring):Object.freeze([]);
}
