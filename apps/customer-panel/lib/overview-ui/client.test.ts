import assert from 'node:assert/strict';
import test from 'node:test';
import {createOverviewApi} from './client.ts';
const dashboard={period:'month',rangeStart:'2026-10-01T00:00:00.000Z',rangeEnd:'2026-10-22T12:00:00.000Z',generatedAt:'2026-10-22T12:00:00.000Z',currency:'TRY',revenueCents:1200,orders:{total:1,paid:1,cancelled:0,refunded:0},customers:{total:1,newInPeriod:1},catalog:{activeProducts:1,lowStockVariants:0},series:[],topProducts:[]};
test('Overview client reads only its separate same-origin no-store dashboard route',async()=>{
 let calls=0;const api=createOverviewApi(async(path,init)=>{calls++;assert.equal(path,'/api/overview/dashboard?period=month');assert.deepEqual(init,{credentials:'same-origin',cache:'no-store'});return Response.json(dashboard);});
 assert.deepEqual(await api.dashboard('month'),dashboard);assert.equal(calls,1);
 await assert.rejects(api.dashboard('month&storeId=forged' as never),/overview_client_invalid/);assert.equal(calls,1);
});
test('Overview client rejects malformed and mismatched-period data and keeps failures finite',async()=>{
 for(const response of [Response.json({...dashboard,period:'week'}),Response.json({...dashboard,private:'secret'}),new Response('not json'),Response.json({code:'membership_denied'},{status:403}),Response.json({code:'private-database-password'},{status:500})]){
  const api=createOverviewApi(async()=>response);await assert.rejects(api.dashboard('month'),(error:any)=>{assert.equal(error.code,response.status===403?'membership_denied':'unavailable');assert.doesNotMatch(error.message,/secret|password/);return true;});
 }
 const api=createOverviewApi(async()=>{throw Error('private-database-password');});await assert.rejects(api.dashboard('month'),(error:any)=>error.code==='unavailable');
});
