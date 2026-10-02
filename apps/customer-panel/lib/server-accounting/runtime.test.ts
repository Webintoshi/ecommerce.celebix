import assert from 'node:assert/strict';
import test from 'node:test';
import type {AccountingRepository} from '@celebix/saas-data';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
import {registerServerAccountingRepository,resolveServerAccountingRuntime} from './runtime.ts';
function access(enabled=true):ServerPanelAccessRuntime{return {readiness:{mode:enabled?'approved_staging':'disabled'},panelOrigin:enabled?'https://panel.example.test':null,resolveCredential:async()=>({kind:'unauthenticated'}),rotateCredential:async()=>({kind:'unavailable'}),revokeCredential:async()=>({kind:'unavailable'})};}
function repository(){const api=Object.fromEntries(['overview','receivables','customerAccount','orderFinance','previewCollection','collectionAccounts','accounts','expenses','collect','openingDebt','saveAccount','openBalance','expense','transfer','settleCard','reverse','returnCredit','refund','operation'].map(method=>[method,async()=>({})]));return {...api,pool:{private:true}} as unknown as AccountingRepository;}
test('registered financial operations are scoped to their approved access runtime and expose no pool',()=>{
  const a=access(),other=access();registerServerAccountingRepository(a,repository());
  const result=resolveServerAccountingRuntime(a);assert.ok(result);assert.equal(Object.isFrozen(result.accounting),true);assert.equal('pool'in result.accounting,false);assert.equal(resolveServerAccountingRuntime(other),null);
  assert.equal(typeof result.accounting.previewCollection,'function');
});
test('disabled incomplete and repeated finance registration fail closed',()=>{
  assert.equal(resolveServerAccountingRuntime(access(false)),null);assert.throws(()=>registerServerAccountingRepository(access(false),repository()));
  const a=access();assert.throws(()=>registerServerAccountingRepository(a,{} as AccountingRepository));registerServerAccountingRepository(a,repository());assert.throws(()=>registerServerAccountingRepository(a,repository()));
});
