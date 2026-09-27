import assert from 'node:assert/strict';
import test from 'node:test';
import {composeApprovedStagingFlow,decodeBridgeForm,cookieValue,REGISTER,BOOTSTRAP,CALLBACK,OWNER_ORIGIN} from '../auth-route-mount/flow-fixture.mjs';
test('enabled pending callback signed transport redirects to status while separate Owner proof remains usable',async()=>{
 const flow=composeApprovedStagingFlow({onboarding:true});
 const response=await flow.owner.browserBoundRegistrationHandler(new Request(REGISTER,{method:'POST',headers:{origin:OWNER_ORIGIN,'content-type':'application/json'},body:JSON.stringify({storeName:'QA pending',storeSlug:'qa-pending',marketingConsent:false,privacyConsent:true})}));
 assert.equal(response.status,200);const proof=cookieValue(response,'__Host-celebix_onboarding_status');assert.ok(proof.startsWith('os1.'));const form=decodeBridgeForm(await response.text());
 const bootstrap=await flow.customer.browserBootstrapHandler(new Request(BOOTSTRAP,{method:'POST',headers:{origin:OWNER_ORIGIN,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)}));assert.equal(bootstrap.status,303);
 const browserProof=cookieValue(bootstrap,'__Host-celebix_panel_pre_auth');const state=new URL(form.providerAuthorizationUrl).searchParams.get('state');
 const callback=await flow.customer.panelSessionCompletionHandler(new Request(`${CALLBACK}?state=${state}&code=qa-code`,{headers:{cookie:`__Host-celebix_panel_pre_auth=${browserProof}`}}));
 assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),`${OWNER_ORIGIN}/onboarding/status`);assert.equal(flow.counts.issuer,0);assert.equal(flow.counts.redeemer,0);
 const status=await flow.owner.onboardingStatusHandler(new Request(`${OWNER_ORIGIN}/api/self-serve/status`,{headers:{cookie:`__Host-celebix_onboarding_status=${proof}`}}));assert.equal(status.status,200);assert.equal((await status.json()).stage,'checking_access');assert.equal(status.headers.has('set-cookie'),false);
 const other=await flow.owner.onboardingStatusHandler(new Request(`${OWNER_ORIGIN}/api/self-serve/status`));assert.equal(other.status,401);
 const replay=await flow.customer.panelSessionCompletionHandler(new Request(`${CALLBACK}?state=${state}&code=qa-code`,{headers:{cookie:`__Host-celebix_panel_pre_auth=${browserProof}`}}));assert.equal(replay.status,409);assert.equal(flow.counts.issuer,0);
});
