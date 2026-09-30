import 'server-only';
import {redirect} from 'next/navigation';
import type {MerchantAdminRecordKind} from '@celebix/saas-contracts';
import {requireServerPanelAccess} from '@/lib/server-access';
import {resolveDefaultServerPanelAccessRuntime} from '@/lib/server-panel-access/default';
import {resolveServerMerchantAdminRuntime} from '@/lib/server-merchant-admin/runtime';
import {legacySeoDestination} from './model';
export type SeoSearchParams=Record<string,string|string[]|undefined>;
export async function redirectLegacySeo({route,kind,recordId,searchParams}:Readonly<{route:string;kind?:MerchantAdminRecordKind;recordId?:string;searchParams?:SeoSearchParams}>):Promise<never>{
 const{tenantContext}=await requireServerPanelAccess();let resourceId:string|null=null;let contentIsPage=false;
 if(recordId&&kind&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId)){try{const runtime=resolveServerMerchantAdminRuntime(await resolveDefaultServerPanelAccessRuntime());const record=await runtime?.merchantAdmin.get({tenantContext,now:new Date(),kind,recordId});if(record&&record.status!=='archived'&&typeof record.config.resourceId==='string'){resourceId=record.config.resourceId;if(route==='content'){try{contentIsPage=Boolean(await runtime?.merchantAdmin.get({tenantContext,now:new Date(),kind:'page',recordId:resourceId}));}catch{/* A blog resource is not a page. */}}}}catch{/* The canonical kind list remains usable when a retired record is absent. */}}
 let destination=legacySeoDestination(route,resourceId);const url=new URL(destination,'https://panel.invalid');if(contentIsPage)url.searchParams.set('kind','page');if(typeof searchParams?.query==='string')url.searchParams.set('query',searchParams.query.slice(0,100));if(searchParams?.missing==='1')url.searchParams.set('missing','1');if(recordId&&kind&&!url.searchParams.has('resourceId')){url.searchParams.set('legacyRecord',recordId);url.searchParams.set('legacyKind',kind);}destination=`${url.pathname}${url.search}`;redirect(destination);
}
