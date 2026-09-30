import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PostgresSeoWorkerRepository, PostgresPublicSeoRepository, PostgresPublicStorefrontRepository } from '@celebix/saas-data';
import { parseCheckoutRuntimeConfig } from './checkout/config.ts';
import { deliverSeoBatch, fetchVerifiedStorefrontDocument, submitIndexNow } from './seo-worker.ts';
import { resolveProductSeo } from './product-seo.ts';

const TIMEOUTS={poolCheckoutMs:2000,statementMs:5000,lockMs:2000,idleTransactionMs:5000};
export async function initializeSeoWorker(){
  const config=parseCheckoutRuntimeConfig(process.env);
  const pool=new pg.Pool({connectionString:config.database.url,max:3,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,application_name:'celebix-seo-worker'});
  pool.on('error',()=>undefined);
  try {
    const check=await pool.query("SELECT current_database() AS database_name,role.rolsuper AS is_superuser,pg_has_role(current_user,'celebix_saas_workflow','MEMBER') AS workflow_member,pg_has_role(current_user,'celebix_saas_host_resolver','MEMBER') AS resolver_member,to_regprocedure('saas.seo_worker_claim(timestamptz,integer,text)') IS NOT NULL AS ready FROM pg_roles role WHERE role.rolname=current_user");
    const row=check.rows[0];
    if(check.rowCount!==1||row?.database_name!==config.database.name||row.is_superuser!==false||row.workflow_member!==true||row.resolver_member!==true||row.ready!==true)throw Error('seo_worker_readiness_failed');
    const repository=new PostgresSeoWorkerRepository({pool,role:'celebix_saas_workflow',timeouts:TIMEOUTS});
    const publicSeo=new PostgresPublicSeoRepository({pool,role:'celebix_saas_host_resolver',timeouts:TIMEOUTS});
    const storefronts=new PostgresPublicStorefrontRepository({pool,role:'celebix_saas_host_resolver',timeouts:TIMEOUTS});
    const workerId=`seo-${randomUUID()}`;
    return {tick:()=>deliverSeoBatch(repository,{now:()=>new Date(),workerId,storefront:fetchVerifiedStorefrontDocument,indexNow:submitIndexNow,resource:async(hostname,kind,id)=>{
      const [selection,storefront]=await Promise.all([publicSeo.get({hostname,now:new Date(),kind,id}),storefronts.getPublicStorefront({hostname,now:new Date()})]);
      const resource=selection.resource;
      return {...resource,effectiveTitle:resource.title===null?'':resolveProductSeo({title:resource.name,seoTitle:resource.title},storefront.presentation.displayName).title,effectiveDescription:resource.description===null?'':resolveProductSeo({title:resource.name,seoDescription:resource.description},'').description};
    },settings:hostname=>publicSeo.settings({hostname,now:new Date()})}),close:()=>pool.end()};
  } catch(error){await pool.end().catch(()=>undefined);throw error;}
}
