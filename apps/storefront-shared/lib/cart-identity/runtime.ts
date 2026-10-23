import {accountCredentialDigestCandidates,readAccountCookie,type StorefrontIdentityKeyring} from '../account/credential.ts';
import {credentialDigestCandidates,readStorefrontCredentialCookie,type StorefrontCommerceCredentialKeyring} from '../cart/credential.ts';

export type BindStorefrontCartIdentity = (input: Readonly<{
  hostname: string;
  cookieHeader: string | null;
  accountCookieHeader?: string;
  cartCookieHeader?: string;
}>) => Promise<void>;
export type CartIdentityBinding = Readonly<{
  hostname: string;
  now: Date;
  accountCandidates: readonly Readonly<{keyId:string;digest:string}>[];
  cartCandidates: readonly Readonly<{keyId:string;digest:string}>[];
}>;
export function createStorefrontCartIdentityBinder(options: Readonly<{
  accountKeyring: StorefrontIdentityKeyring;
  cartKeyring: StorefrontCommerceCredentialKeyring;
  now(): Date;
  bind(input: CartIdentityBinding): Promise<unknown>;
}>): BindStorefrontCartIdentity {
  return async input => {
    // Two independent, host-only proofs are required. No customer/cart ID is
    // supplied by the browser and neither raw credential enters the database.
    const account=readAccountCookie(input.accountCookieHeader??input.cookieHeader);
    const cart=readStorefrontCredentialCookie('cart',input.cartCookieHeader??input.cookieHeader);
    if(account.kind!=='present'||cart.kind!=='present')return;
    const accountCandidates=accountCredentialDigestCandidates(account.value,options.accountKeyring);
    const cartCandidates=credentialDigestCandidates('cart',cart.value,options.cartKeyring);
    if(accountCandidates.length===0||cartCandidates.length===0)return;
    const now=options.now();
    if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error('cart_identity_binding_unavailable');
    const outcome=await options.bind({hostname:input.hostname,now:new Date(now),accountCandidates,cartCandidates});
    if(typeof outcome!=='string'||!['bound','already_bound','no_cart','unauthenticated','cart_conflict','unavailable','invalid_input'].includes(outcome))throw Error('cart_identity_binding_unavailable');
  };
}
