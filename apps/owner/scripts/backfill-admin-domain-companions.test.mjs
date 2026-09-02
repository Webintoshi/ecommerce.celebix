import assert from "node:assert/strict";
import test from "node:test";
import { buildBackfillPlan, resolveBackfillConfiguration, runBackfill } from "./backfill-admin-domain-companions.mjs";

const policy={reservedSuffixes:["celebix.site"],cnameTarget:"customers.saas-staging.celebix.site"};
test("dry-run classifies create adopt replay and cross-tenant conflict without mutation",()=>{
  const storefronts=[
    {storeId:"store-a",id:"front-a",hostname:"www.example.com"},{storeId:"store-b",id:"front-b",hostname:"shop.example.co.uk"},{storeId:"store-c",id:"front-c",hostname:"ornek.com"},{storeId:"store-d",id:"front-d",hostname:"other.net"},
  ];
  const admins=[
    {storeId:"store-a",id:"admin-a",hostname:"admin.example.com",management:"merchant",sourceStorefrontDomainId:null,hostnameStatus:"active",sslStatus:"active",dnsStatus:"ready",originStatus:"ready"},
    {storeId:"store-b",id:"admin-b",hostname:"admin.example.co.uk",management:"system",sourceStorefrontDomainId:"front-b",hostnameStatus:"pending",sslStatus:"pending",dnsStatus:"pending",originStatus:"pending"},
    {storeId:"different",id:"admin-c",hostname:"admin.ornek.com",management:"merchant",sourceStorefrontDomainId:null,hostnameStatus:"active",sslStatus:"active",dnsStatus:"ready",originStatus:"ready"},
  ];
  assert.deepEqual(buildBackfillPlan(storefronts,admins,policy).map(({action,expectedAdminHostname})=>[action,expectedAdminHostname]),[["adopt","admin.example.com"],["replay","admin.example.co.uk"],["conflict","admin.ornek.com"],["create","admin.other.net"]]);
});

test("dry-run ignores legacy custom-domain rows under reserved platform suffixes",()=>{
  const plan=buildBackfillPlan([
    {storeId:"platform-store",id:"platform-front",hostname:"pilot.saas-staging.celebix.site"},
    {storeId:"merchant-store",id:"merchant-front",hostname:"example.com"},
  ],[],policy);
  assert.deepEqual(plan.map(({storefrontHostname,expectedAdminHostname})=>[storefrontHostname,expectedAdminHostname]),[["example.com","admin.example.com"]]);
});

test("dry-run config never requires or projects provider credentials",()=>{
  const config=resolveBackfillConfiguration({CELEBIX_DEPLOYMENT_TIER:"staging",CELEBIX_STAGING_MIGRATION_MODE:"approved_staging",CELEBIX_TOSHI_MIGRATION_DATABASE_URL:"postgresql://owner:secret@db.test/saas",CELEBIX_CUSTOM_ADMIN_DOMAIN_CNAME_TARGET:"customers.saas-staging.celebix.site",CELEBIX_CUSTOM_DOMAIN_RESERVED_SUFFIXES:"celebix.site"},[]);
  assert.equal(config.apply,false);assert.equal("apiToken" in config,false);
});

test("apply replay resumes an unbound provider intent with separate transactional queries",async()=>{
  const calls=[];
  const client={
    async connect(){},async end(){},
    async query(text,values){calls.push({text,values});
      if(text.includes("pg_has_role"))return{rowCount:1,rows:[{owner_member:true,ready:true}]};
      if(text.includes("FROM saas.store_domains"))return{rows:[{storeId:"store-a",id:"front-a",hostname:"example.com"}]};
      if(text.includes("FROM saas.admin_domains"))return{rows:[{storeId:"store-a",id:"admin-a",hostname:"admin.example.com",management:"system",sourceStorefrontDomainId:"front-a",providerHostnameId:null,version:4,hostnameStatus:"pending",sslStatus:"pending",dnsStatus:"pending",originStatus:"pending"}]};
      if(text.includes("owner_bind_admin_domain_companion"))return{rows:[{outcome:"bound"}]};
      return{rows:[]};
    },
  };
  const provider={async create(hostname){return{providerHostnameId:"cf-retry",hostname,ownershipValidation:null,certificateValidation:[]};},async find(){throw new Error("unused");}};
  const result=await runBackfill({client,provider,write(){},config:{apply:true,adminCnameTarget:policy.cnameTarget,reservedSuffixes:policy.reservedSuffixes}});
  assert.equal(result.plan[0].action,"replay");
  assert.equal(calls.some(({text})=>text.includes(";")&&text!=="BEGIN"&&text!=="COMMIT"&&text!=="ROLLBACK"),false);
  const bind=calls.find(({text})=>text.includes("owner_bind_admin_domain_companion"));
  assert.deepEqual(bind.values.slice(0,3),["admin-a",4,"cf-retry"]);
});
