import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { createSetupEdgeProbe, createSetupPlatformGet } from "./edge-client.ts";
import { tenant } from "../setup-ui/fixtures.ts";
const address="46.225.183.57",suffix="saas-staging.celebix.net",context=tenant();
const scope={platformDomainSuffix:suffix,panelOrigin:`https://panel.${suffix}`,allowedAddresses:[address]};
function response(url:URL){return {status:200,body:url.pathname==="/api/health"?JSON.stringify({schemaVersion:1,status:"ok",storeId:context.store.id,hostname:url.hostname,dependencies:{redisCache:{status:"disabled"}}}):url.pathname==="/api/setup-capabilities"?JSON.stringify({schemaVersion:1,storeId:context.store.id,hostname:url.hostname,payment:{kind:"disabled",providers:[]}}):"<html>fixture</html>"};}
test("exact tenant health and bounded landing reads prove access without DNS provider authority",async()=>{
 const urls:string[]=[];const probe=createSetupEdgeProbe({...scope,get:async(url:URL)=>{urls.push(url.href);return response(url);}});
 const proof=await probe(context,new Date());assert.equal(proof.storeId,context.store.id);assert.equal(proof.hostname,`store.${suffix}`);assert.equal(proof.adminHostname,`store.admin.${suffix}`);assert.equal(proof.payment.kind,"disabled");
 assert.deepEqual(new Set(urls),new Set([`https://store.admin.${suffix}/api/health`,`https://store.${suffix}/api/health`,`https://panel.${suffix}/login`,`https://store.admin.${suffix}/login`,`https://store.${suffix}/`,`https://store.${suffix}/api/setup-capabilities`]));
});
test("cross-tenant host proofs unknown landing routes malformed capabilities and unsafe scope fail closed",async()=>{
 for(const mode of["store","host","not_found","payload","disabled_with_provider"]){const probe=createSetupEdgeProbe({...scope,get:async(url:URL)=>{
  if(mode==="not_found"&&url.pathname==="/")return{status:404,body:""};
  const result=response(url);if(url.pathname==="/api/health"){const body=JSON.parse(result.body);if(mode==="store")body.storeId="other";if(mode==="host")body.hostname=`other.${suffix}`;return {...result,body:JSON.stringify(body)};}
  if(url.pathname==="/api/setup-capabilities"){const body=JSON.parse(result.body);if(mode==="payload")body.secret="unexpected";if(mode==="disabled_with_provider")body.payment.providers=[{providerCode:"paytr_iframe",environment:"live"}];return {...result,body:JSON.stringify(body)};}return result;
 }});await assert.rejects(()=>probe(context,new Date()));}
 for(const input of[{...scope,platformDomainSuffix:"evil.test"},{...scope,panelOrigin:"https://evil.test"},{...scope,allowedAddresses:["127.0.0.1"]}])assert.throws(()=>createSetupEdgeProbe(input));
 const probe=createSetupEdgeProbe({...scope,get:async()=>assert.fail("invalid slug called network")});await assert.rejects(()=>probe({...context,store:{...context.store,slug:"other.store"}},new Date()));
});
test("platform transport pins approved DNS IP with exact TLS SNI and enforces body and redirect boundaries",async()=>{
 let options:RequestOptions|undefined;
 function request(body:string,status=200){return ((_url:URL,opts:RequestOptions,callback:(res:EventEmitter&{statusCode:number;headers:{}})=>void)=>{options=opts;const req=new EventEmitter()as EventEmitter&{end():void;destroy(error:Error):void};req.end=()=>{const res=Object.assign(new EventEmitter(),{statusCode:status,headers:{}});callback(res);queueMicrotask(()=>{res.emit("data",Buffer.from(body));res.emit("end");req.emit("close");});};req.destroy=error=>{req.emit("error",error);req.emit("close");};return req;})as unknown as typeof httpsRequest;}
 const get=createSetupPlatformGet({allowedHosts:[`store.${suffix}`],allowedAddresses:[address],lookup:async()=>[{address,family:4}],request:request("ok")});
 assert.deepEqual(await get(new URL(`https://store.${suffix}/`)),{status:200,body:"ok"});assert.equal(options?.rejectUnauthorized,true);assert.equal(options?.servername,`store.${suffix}`);assert.equal(options?.agent,false);
 const pinnedLookup=options?.lookup as (host:string,options:unknown,callback:(error:Error|null,address:string,family:number)=>void)=>void;
 pinnedLookup(`store.${suffix}`,{},(error,value,family)=>{assert.equal(error,null);assert.equal(value,address);assert.equal(family,4);});
 const denied=createSetupPlatformGet({allowedHosts:[`store.${suffix}`],allowedAddresses:[address],lookup:async()=>[{address:"127.0.0.1",family:4}],request:request("ok")});await assert.rejects(()=>denied(new URL(`https://store.${suffix}/`)));
 for(const url of[`http://store.${suffix}/`,`https://evil.test/`,`https://store.${suffix}/?storeId=other`])await assert.rejects(()=>get(new URL(url)));
 for(const [body,status]of[["x".repeat(262145),200],["",302]]as const){const bounded=createSetupPlatformGet({allowedHosts:[`store.${suffix}`],allowedAddresses:[address],lookup:async()=>[{address,family:4}],request:request(body,status)});await assert.rejects(()=>bounded(new URL(`https://store.${suffix}/`)));}
});
test("an unresponsive DNS lookup has a five-second upper deadline",async()=>{
 const get=createSetupPlatformGet({allowedHosts:[`store.${suffix}`],allowedAddresses:[address],lookup:()=>new Promise(()=>undefined)}),started=Date.now();
 await assert.rejects(()=>get(new URL(`https://store.${suffix}/`)));assert.ok(Date.now()-started<6000);
});
