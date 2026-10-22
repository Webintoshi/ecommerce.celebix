import assert from 'node:assert/strict';
import test from 'node:test';
import {InStoreSalesRepositoryError,type InStoreSalesRepository} from '@celebix/saas-data';
import {registerServerInStoreSalesRepository} from '../server-in-store-sales/runtime.ts';
import {createAnalyticsDashboardHttpHandlers} from './dashboard-handler.ts';

const ID='26200000-0000-4000-8000-000000000001',NOW=new Date('2026-10-22T12:00:00Z');
function dashboard(){return{period:'month',rangeStart:'2026-10-01T00:00:00.000Z',rangeEnd:NOW.toISOString(),generatedAt:NOW.toISOString(),currency:'TRY',revenueCents:1200,orders:{total:1,paid:1,cancelled:0,refunded:0},customers:{total:1,newInPeriod:1},catalog:{activeProducts:1,lowStockVariants:0},series:[],topProducts:[]};}
function fixture(role='cashier',legacy=false){
 let granted=true,nativeResult:unknown=dashboard();const calls:string[]=[],context={membership:{role}},access={readiness:{mode:'approved_staging' as const},panelOrigin:'https://panel.example.test',resolveCredential:async()=>({kind:'authenticated' as const,tenantContext:context}),rotateCredential:async()=>({kind:'unavailable' as const}),revokeCredential:async()=>({kind:'unavailable' as const})};
 const methods=['searchCustomers','createCustomer','bootstrap','searchProducts','listSales','getSale','getOperation','createSale','updateSale','holdSale','prepareSale','confirmPayment','completeSale','cancelSale','takeoverSale','listStaff','setStaffGrant'];
 registerServerInStoreSalesRepository(access as never,{...Object.fromEntries(methods.map(method=>[method,async()=>({})])),...(!legacy?{getOverviewAccess:async(input:any)=>{assert.equal(input.tenantContext,context);calls.push('grant');return{canViewOverview:granted};},getOverviewDashboard:async(input:any)=>{assert.equal(input.tenantContext,context);assert.equal(input.period,'month');calls.push('overview');if(nativeResult instanceof Error)throw nativeResult;return nativeResult;}}:{})} as unknown as InStoreSalesRepository);
 const runtime={access,analytics:{dashboard:async()=>{calls.push('analytics');return dashboard();}}};
 return{calls,revoke(){granted=false;},native(value:unknown){nativeResult=value;},handlers:createAnalyticsDashboardHttpHandlers({resolveRuntime:async()=>runtime as never,now:()=>NOW,requestId:()=>ID})};
}
function request(path='/api/analytics/dashboard?period=month',extra:HeadersInit={}){return new Request('https://panel.example.test'+path,{headers:{cookie:'__Host-celebix_panel=v1.key.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',...extra}});}
test('cashier Overview dashboard uses only its isolated Overview reader and rechecks revocation every request',async()=>{
 const f=fixture();assert.equal((await f.handlers.overview(request('/api/overview/dashboard?period=month'))).status,200);assert.deepEqual(f.calls,['grant','overview']);
 f.revoke();const denied=await f.handlers.overview(request('/api/overview/dashboard?period=month'));assert.equal(denied.status,403);assert.deepEqual(await denied.json(),{code:'membership_denied'});assert.deepEqual(f.calls,['grant','overview','grant']);assert.equal(denied.headers.get('cache-control'),'no-store');
});
test('legacy cashier runtime cannot use general analytics to bypass a missing Overview reader',async()=>{
 const f=fixture('cashier',true);assert.equal((await f.handlers.overview(request('/api/overview/dashboard?period=month'))).status,403);assert.deepEqual(f.calls,[]);
});
test('ordinary dashboard and exports preserve the existing analytics reader',async()=>{
 const f=fixture('store_owner');assert.equal((await f.handlers.dashboard(request())).status,200);assert.equal((await f.handlers.export(request('/api/analytics/export?period=month&format=json'))).status,200);assert.deepEqual(f.calls,['analytics','analytics']);
});
test('existing cashier analytics remains available when the independent Overview grant is off',async()=>{
 const f=fixture();f.revoke();assert.equal((await f.handlers.dashboard(request())).status,200);assert.deepEqual(f.calls,['analytics']);
});
test('private browser authority and malformed input fail before permission or dashboard reads',async()=>{
 const f=fixture();for(const r of [request(undefined,{'x-store-id':ID}),request('/api/analytics/dashboard?period=month&canViewOverview=true')])assert.equal((await f.handlers.dashboard(r)).status,400);assert.deepEqual(f.calls,[]);
});
test('native revocation after the HTTP grant read denies without falling back to analytics',async()=>{
 const f=fixture();f.native(new InStoreSalesRepositoryError('membership_denied'));const response=await f.handlers.overview(request('/api/overview/dashboard?period=month'));assert.equal(response.status,403);assert.deepEqual(await response.json(),{code:'membership_denied'});assert.deepEqual(f.calls,['grant','overview']);
});
test('malformed wrong-period and unavailable Overview results remain private failures',async()=>{
 for(const value of [{...dashboard(),period:'week'},{...dashboard(),extra:'private'},new Error('private-database-password')]){
  const f=fixture();f.native(value);const response=await f.handlers.overview(request('/api/overview/dashboard?period=month'));assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'unavailable'});assert.deepEqual(f.calls,['grant','overview']);
 }
});
