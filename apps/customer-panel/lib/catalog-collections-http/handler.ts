import { parseCatalogAdminMutationResult, parseCatalogCollectionConfig, parseCatalogCollectionDescription, parseCatalogCollectionDetail, parseCatalogCollectionListPage, parseCatalogCollectionListQuery, parseCatalogCollectionMembersPage, parseCatalogCollectionMembersQuery, parseCatalogCollectionProductIds } from "@celebix/saas-contracts";
import { authorizeCatalogAdminRequest as authorize, readCatalogAdminJsonBody as body, executeCatalogAdminRequest as execute, catalogAdminHttpError as error, exactCatalogAdminHttpInput as exact, catalogAdminOperationId as operation, catalogAdminHttpId as id, catalogAdminHttpVersion as version, type CatalogAdminHttpDependencies } from "../catalog-admin-http/handler.ts";

const BASE = "/api/catalog/collections";
function listQuery(request: Request) {
  const entries=[...new URL(request.url).searchParams.entries()];
  if(new Set(entries.map(([key])=>key)).size!==entries.length)throw new TypeError();
  const raw=Object.fromEntries(entries);
  for(const key of ["page","pageSize"]) if(Object.hasOwn(raw,key) && !/^[1-9]\d{0,5}$/.test(raw[key]!))throw new TypeError();
  return parseCatalogCollectionListQuery({...raw,...(raw.page?{page:Number(raw.page)}:{}),...(raw.pageSize?{pageSize:Number(raw.pageSize)}:{})});
}
function saveInput(value: unknown) {
  const parsed=exact(value,["name","config","productIds"],["resourceId","expectedVersion","description"]);
  if(!parsed || typeof parsed.name!=="string" || !parsed.name || parsed.name.trim()!==parsed.name || parsed.name.length>120 || /[\u0000-\u001f\u007f]/.test(parsed.name))throw new TypeError();
  if((parsed.resourceId!==undefined && (!id(parsed.resourceId)||!version(parsed.expectedVersion))) || (parsed.resourceId===undefined && parsed.expectedVersion!==undefined))throw new TypeError();
  const config=parseCatalogCollectionConfig(parsed.config);
  return Object.freeze({name:parsed.name,config,productIds:parseCatalogCollectionProductIds(parsed.productIds,config.mode === "automatic" ? 100000 : 10000),...(parsed.resourceId!==undefined?{resourceId:parsed.resourceId as string,expectedVersion:parsed.expectedVersion as number}:{}),...(parsed.description!==undefined?{description:parseCatalogCollectionDescription(parsed.description)}:{})});
}
export function createCatalogCollectionsHttpHandlers(deps: CatalogAdminHttpDependencies) {
  return Object.freeze({
    async list(request: Request) {
      const auth=await authorize(deps,request,"GET",BASE,"allowed");if(auth instanceof Response)return auth;
      if(!auth.runtime.catalogAdmin.listCollections)return error("unavailable",503);
      let query;try{query=listQuery(request);}catch{return error("invalid_input",400);}
      return execute(()=>auth.runtime.catalogAdmin.listCollections!({tenantContext:auth.tenantContext,now:auth.now,query}),parseCatalogCollectionListPage);
    },
    async detail(request: Request, rawId: unknown) {
      const collectionId=id(rawId);if(!collectionId)return error("invalid_input",400);
      const auth=await authorize(deps,request,"GET",`${BASE}/${collectionId}`,"forbidden");if(auth instanceof Response)return auth;
      return auth.runtime.catalogAdmin.getCollection?execute(()=>auth.runtime.catalogAdmin.getCollection!({tenantContext:auth.tenantContext,now:auth.now,collectionId}),parseCatalogCollectionDetail):error("unavailable",503);
    },
    async members(request: Request) {
      const auth=await authorize(deps,request,"POST",`${BASE}/members`,"forbidden");if(auth instanceof Response)return auth;
      if(!auth.runtime.catalogAdmin.collectionMembers)return error("unavailable",503);
      let input;try{
        const parsed=exact(await body(request,5_242_880),["query"],["collectionId","config"]);if(!parsed || (parsed.collectionId!==undefined&&!id(parsed.collectionId)) || (parsed.collectionId===undefined&&parsed.config===undefined))throw new TypeError();
        input={query:parseCatalogCollectionMembersQuery(parsed.query),...(parsed.collectionId!==undefined?{collectionId:parsed.collectionId as string}:{}),...(parsed.config!==undefined?{config:parseCatalogCollectionConfig(parsed.config)}:{})};
      }catch{return error("invalid_input",400);}
      return execute(()=>auth.runtime.catalogAdmin.collectionMembers!({tenantContext:auth.tenantContext,now:auth.now,...input}),parseCatalogCollectionMembersPage);
    },
    async save(request: Request) {
      const auth=await authorize(deps,request,"POST",BASE,"forbidden");if(auth instanceof Response)return auth;
      const operationId=operation(request);if(!operationId)return error("invalid_input",400);
      let input;try{input=saveInput(await body(request,5_242_880));}catch{return error("invalid_input",400);}
      return execute(()=>auth.runtime.catalogAdmin.saveResource({tenantContext:auth.tenantContext,now:auth.now,operationId,kind:"collection",slug:"",...input,config:input.config as unknown as Readonly<Record<string,never>>}),parseCatalogAdminMutationResult);
    },
    async archive(request: Request, rawId: unknown) { return transition(request,rawId,"archive"); },
    async restore(request: Request, rawId: unknown) { return transition(request,rawId,"restore"); },
  });
  async function transition(request: Request,rawId: unknown,action:"archive"|"restore") {
    const resourceId=id(rawId);if(!resourceId)return error("invalid_input",400);
    const auth=await authorize(deps,request,"POST",`${BASE}/${resourceId}/${action}`,"forbidden");if(auth instanceof Response)return auth;
    const operationId=operation(request),parsed=exact(await body(request),["expectedVersion"]),expectedVersion=parsed?version(parsed.expectedVersion):null;
    if(!operationId||!expectedVersion)return error("invalid_input",400);
    if(!auth.runtime.catalogAdmin.getCollection || (action==="restore"&&!auth.runtime.catalogAdmin.restoreCollection))return error("unavailable",503);
    return execute(async()=>{
      // Check kind with durable tenant authority before the existing atomic archive mutation.
      await auth.runtime.catalogAdmin.getCollection!({tenantContext:auth.tenantContext,now:auth.now,collectionId:resourceId});
      const input={tenantContext:auth.tenantContext,now:auth.now,operationId,resourceId,expectedVersion};
      return action==="archive"?auth.runtime.catalogAdmin.archiveResource(input):auth.runtime.catalogAdmin.restoreCollection!(input);
    },parseCatalogAdminMutationResult);
  }
}
