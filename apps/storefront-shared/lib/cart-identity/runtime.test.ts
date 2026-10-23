import assert from 'node:assert/strict';
import test from 'node:test';
import {createStorefrontCartIdentityBinder,type CartIdentityBinding} from './runtime.ts';
import {createAccountSessionCredential,accountCredentialDigestCandidates,serializeAccountCookie} from '../account/credential.ts';
import {createStorefrontCredential,credentialDigestCandidates,serializeStorefrontCredentialCookie} from '../cart/credential.ts';

const accountKeyring={activeKeyId:'account_01',keys:[{keyId:'account_01',key:new Uint8Array(32).fill(1)}]};
const cartKeyring={activeKeyId:'commerce_01',keys:[{keyId:'commerce_01',key:new Uint8Array(32).fill(2)}]};
const account=createAccountSessionCredential(accountKeyring,n=>new Uint8Array(n).fill(3));
const nextAccount=createAccountSessionCredential(accountKeyring,n=>new Uint8Array(n).fill(4));
const cart=createStorefrontCredential('cart',cartKeyring,n=>new Uint8Array(n).fill(5));
const nextCart=createStorefrontCredential('cart',cartKeyring,n=>new Uint8Array(n).fill(6));
const hostname='identity-test.saas-staging.celebix.site';
const now=new Date('2026-10-23T19:30:08.000Z');
const cookies=`__Host-celebix_account=${account.value}; __Host-celebix_cart=${cart.value}`;
function fixture(outcome:unknown='bound') {
  const calls:CartIdentityBinding[]=[];
  const bind=createStorefrontCartIdentityBinder({accountKeyring,cartKeyring,now:()=>now,bind:async input=>{calls.push(input);return outcome;}});
  return {bind,calls};
}
test('binds only server-derived account and cart proof in the routed store',async()=>{
  const f=fixture();await f.bind({hostname,cookieHeader:cookies});
  assert.deepEqual(f.calls,[{hostname,now,accountCandidates:accountCredentialDigestCandidates(account.value,accountKeyring),cartCandidates:credentialDigestCandidates('cart',cart.value,cartKeyring)}]);
  assert.equal(JSON.stringify(f.calls).includes(account.value),false);
  assert.equal(JSON.stringify(f.calls).includes(cart.value),false);
});
test('login and first add use the newly committed credentials instead of stale incoming cookies',async()=>{
  const f=fixture();await f.bind({hostname,cookieHeader:cookies,accountCookieHeader:serializeAccountCookie(nextAccount.value),cartCookieHeader:serializeStorefrontCredentialCookie('cart',nextCart.value)});
  assert.deepEqual(f.calls[0]?.accountCandidates,accountCredentialDigestCandidates(nextAccount.value,accountKeyring));
  assert.deepEqual(f.calls[0]?.cartCandidates,credentialDigestCandidates('cart',nextCart.value,cartKeyring));
});
test('missing malformed duplicate and wrong-purpose proofs cannot issue a binding query',async()=>{
  const f=fixture();for(const cookieHeader of [null,'',`__Host-celebix_account=${account.value}`,`__Host-celebix_cart=${cart.value}`,cookies+`; __Host-celebix_account=${account.value}`,cookies+`; __Host-celebix_cart=${cart.value}`,`__Host-celebix_account=${cart.value}; __Host-celebix_cart=${account.value}`])await f.bind({hostname,cookieHeader});
  assert.equal(f.calls.length,0);
});
test('accepts only the bounded native outcomes and never retries an unknown result',async()=>{
  for(const outcome of ['bound','already_bound','no_cart','unauthenticated','cart_conflict','unavailable','invalid_input']){
    const f=fixture(outcome);await f.bind({hostname,cookieHeader:cookies});assert.equal(f.calls.length,1);
  }
  for(const outcome of [null,{customerId:'private'},'unknown']){
    const f=fixture(outcome);await assert.rejects(f.bind({hostname,cookieHeader:cookies}),/cart_identity_binding_unavailable/);assert.equal(f.calls.length,1);
  }
});
