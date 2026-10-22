import 'server-only';
import {cache} from 'react';
import type {TenantContext} from '@celebix/saas-contracts';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {readOverviewAccess} from './permission.ts';

/** Request-local chrome only; native reads and HTTP requests recheck durable authority. */
export const resolvePanelOverviewAccess=cache(async(tenantContext:TenantContext)=>{
 try{return await readOverviewAccess(tenantContext,await resolveDefaultServerPanelAccessRuntime(),new Date());}
 catch{return Object.freeze({canViewOverview:false});}
});
