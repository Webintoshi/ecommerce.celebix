import assert from'node:assert/strict';import test from'node:test';
import type{MerchantContentRepository}from'@celebix/saas-data';
import{registerServerMerchantContentRepository,resolveServerMerchantContentRuntime}from'./runtime.ts';
const reject=async()=>{throw new Error('unexpected')};
const repo={get:reject,save:reject,listVersions:reject,recoverOperation:reject}as MerchantContentRepository;
const access=(mode:'approved_staging'|'disabled'='approved_staging')=>({readiness:{mode},panelOrigin:mode==='approved_staging'?'https://panel.test':null})as never;
test('only approved bound access exposes a frozen typed repository facade',()=>{const approved=access();registerServerMerchantContentRepository(approved,repo);const runtime=resolveServerMerchantContentRuntime(approved);assert.deepEqual(Object.keys(runtime?.merchantContent??{}),['get','save','listVersions','recoverOperation']);assert.equal(Object.isFrozen(runtime?.merchantContent),true);assert.equal(resolveServerMerchantContentRuntime(access('disabled')),null);assert.throws(()=>registerServerMerchantContentRepository(approved,repo));});
