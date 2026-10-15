import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {compile} from '../../lib/mira-final-test-support.ts';
import {getPanelNavigation,getPanelRoutePresentation} from '../../lib/panel-ui/navigation.ts';
test('supplier page uses owner admin authority and actor store scoped recovery',async()=>{const path='app/(panel)/accounting/suppliers/page.tsx';assert.ok(existsSync(new URL('../../'+path,import.meta.url)));for(const role of['store_owner','admin','cashier','editor']){let got:any;const Page=compile(path,{'@/components/accounting/SupplierDebtsConsole':{SupplierDebtsConsole:(props:any)=>{got=props;return createElement('div')}},'@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:{store:{id:'store'},membership:{id:'actor',role}}})}}).default;renderToStaticMarkup(await Page());assert.equal(got.canManage,role==='store_owner'||role==='admin');assert.equal(got.scopeKey,'store:actor')}});
test('shared supplier menu and route presentation retain cashier isolation',()=>{const group=getPanelNavigation({analyticsAvailable:false}).find(item=>item.key==='accounting');assert.equal(group?.children?.find(item=>item.href==='/accounting/suppliers')?.label,'Tedarikçi borçları');assert.equal(getPanelRoutePresentation('/accounting/suppliers').title,'Tedarikçi borçları');assert.equal(getPanelNavigation({analyticsAvailable:false,navigationMode:'register'}).some(item=>item.href==='/accounting/suppliers'),false)});
