import {normalizeOnboardingScope,type RegistrationAuthorityScope} from "../onboarding-jobs/types.ts";
import type {OnboardingStatusCredentialCodec} from "./credential-codec.ts";
import {readOnboardingStatusCookie} from "./cookie.ts";
import {presentOnboardingStatus} from "./presentation.ts";
import type {OnboardingStatusReader} from "./types.ts";
export function createOnboardingStatusHandler(options:{scope:RegistrationAuthorityScope;codec:OnboardingStatusCredentialCodec;repository:OnboardingStatusReader;clock():Date}) {
 const scope=normalizeOnboardingScope(options.scope);
 const response=(body:unknown,status:number)=>Response.json(body,{status,headers:{"cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff"}});
 return async function readStatus(request:Request):Promise<Response>{
  if(request.method!=="GET")return response({code:"onboarding_status_method_not_allowed"},405);
  const url=new URL(request.url);const origin=request.headers.get("origin");
  if(url.origin!==scope.ownerOrigin||url.pathname!=="/api/self-serve/status"||url.search||url.hash||origin&&origin!==scope.ownerOrigin||request.headers.get("sec-fetch-site")==="cross-site")return response({code:"onboarding_status_unauthorized"},401);
  const digest=options.codec.digest(readOnboardingStatusCookie(request.headers));
  if(!digest)return response({code:"onboarding_status_unauthorized"},401);
  try {
   const result=await options.repository.readStatus({digest,scope,now:options.clock()});
   return result.kind==="status"?response(presentOnboardingStatus(result.projection,scope),200):response({code:`onboarding_status_${result.kind}`},result.kind==="unavailable"?503:401);
  }catch{return response({code:"onboarding_status_unavailable"},503);}
 };
}
