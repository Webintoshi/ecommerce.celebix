import 'server-only';
import {isCatalogProductOperationAllowed,parseProductTaxRead} from '@celebix/saas-contracts';
import {CatalogRepositoryError} from '../../../../packages/saas-data/src/catalog/errors.ts';
import {readPersistentPanelSessionCookie} from '../server-panel-session-controls/request-input.ts';
import type {ServerProductTaxRuntime} from '../server-product-tax/runtime.ts';
type Dependencies=Readonly<{resolveRuntime():Promise<ServerProductTaxRuntime|null>;now():Date;requestId():string}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function json(value:unknown,status=200,extra?:Record<string,string>):Response{return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...extra}});}
function error(code:string,status:number,extra?:Record<string,string>):Response{return json({code},status,extra);}
const STATUSES:Readonly<Record<string,number>>={invalid_input:400,unauthenticated:401,membership_denied:403,store_inactive:403,feature_not_enabled:403,product_not_found:404,durable_authority_invalid:409,unavailable:503};
export function createProductTaxHttpHandlers(dependencies:Dependencies){return Object.freeze({async get(request:Request,productId:unknown):Promise<Response>{
 if(typeof productId!=='string'||!UUID.test(productId))return error('invalid_input',400);
 if(request.method!=='GET')return error('method_not_allowed',405,{allow:'GET'});
 let url:URL;try{url=new URL(request.url);}catch{return error('invalid_input',400);}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/api/catalog/products/'+productId+'/tax'||url.search||url.hash)return error('invalid_input',400);
 for(const [name]of request.headers)if(name==='authorization'||name.startsWith('x-celebix')||['x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-product-limit','x-database-role','x-database-url','x-panel-session-credential'].includes(name))return error('invalid_input',400);
 const cookie=readPersistentPanelSessionCookie(request);if(cookie.kind!=='present')return error('unauthenticated',401);
 try{
  const runtime=await dependencies.resolveRuntime();if(!runtime)return error('unavailable',503);
  const now=dependencies.now(),requestId=dependencies.requestId();if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!UUID.test(requestId))return error('unavailable',503);
  const access=await runtime.access.resolveCredential({hostname:request.headers.get('host'),credential:cookie.credential,requestId,now:new Date(now)});
  if(access.kind==='unauthenticated')return error('unauthenticated',401);if(access.kind==='unauthorized')return error('membership_denied',403);if(access.kind!=='authenticated')return error('unavailable',503);
  if(!isCatalogProductOperationAllowed(access.tenantContext.membership.role,'read'))return error('membership_denied',403);
  const projected=parseProductTaxRead(await runtime.repository.read({tenantContext:access.tenantContext,now:new Date(now),productId}));if(projected.productId!==productId)return error('unavailable',503);
  return json(projected);
 }catch(caught){return caught instanceof CatalogRepositoryError&&Object.hasOwn(STATUSES,caught.code)?error(caught.code,STATUSES[caught.code]):error('unavailable',503);}
 }});}
