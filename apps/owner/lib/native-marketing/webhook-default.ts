import pg from "pg";
import { PostgresNativeMarketingRepository } from "@celebix/saas-data";
import { parseNativeMarketingPublicConfig,parseNativeMarketingWebhookConfig,resolveNativeMarketingFlag } from "./config.ts";
import { createNativeMarketingWebhookHandler } from "./webhook.ts";
import { createNativeMarketingUnsubscribeHandler } from "./unsubscribe.ts";
const WEBHOOK=Symbol.for("celebix.owner.native-marketing-webhook"),PUBLIC=Symbol.for("celebix.owner.native-marketing-unsubscribe");
type Handler=(request:Request)=>Promise<Response>;
type Root=typeof globalThis & {[WEBHOOK]?:Handler;[PUBLIC]?:Handler};
const TIMEOUTS=Object.freeze({poolCheckoutMs:2_000,statementMs:5_000,lockMs:2_000,idleTransactionMs:5_000});
function repository(url:string,role:"celebix_saas_workflow"|"celebix_saas_host_resolver"){
  const pool=new pg.Pool({connectionString:url,max:2,connectionTimeoutMillis:2_000,idleTimeoutMillis:10_000,application_name:role==="celebix_saas_workflow"?"celebix-native-marketing-webhook":"celebix-native-marketing-unsubscribe"});pool.on("error",()=>undefined);
  return new PostgresNativeMarketingRepository({pool,role,timeouts:TIMEOUTS});
}
export async function getDefaultNativeMarketingWebhookHandler():Promise<Handler>{
  if(!resolveNativeMarketingFlag(process.env,"CELEBIX_MARKETING_EMAIL_WEBHOOK_ENABLED"))throw new Error("native_marketing_disabled");
  const root=globalThis as Root;if(root[WEBHOOK])return root[WEBHOOK];
  const config=parseNativeMarketingWebhookConfig(process.env),handler=createNativeMarketingWebhookHandler({secret:config.webhookSecret,repository:repository(config.database.url,"celebix_saas_workflow"),now:()=>new Date()});root[WEBHOOK]=handler;return handler;
}
export async function getDefaultNativeMarketingUnsubscribeHandler():Promise<Handler>{
  if(!resolveNativeMarketingFlag(process.env,"CELEBIX_MARKETING_EMAIL_PUBLIC_ENABLED"))throw new Error("native_marketing_disabled");
  const root=globalThis as Root;if(root[PUBLIC])return root[PUBLIC];
  const config=parseNativeMarketingPublicConfig(process.env),handler=createNativeMarketingUnsubscribeHandler({publicOrigin:config.publicOrigin,repository:repository(config.database.url,"celebix_saas_host_resolver"),now:()=>new Date()});root[PUBLIC]=handler;return handler;
}
