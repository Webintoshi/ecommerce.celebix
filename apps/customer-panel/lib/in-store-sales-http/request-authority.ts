import {hasApprovedPanelMutationOriginShape} from '../panel-origin-authority.ts';
export interface InStoreRequestExpectation {readonly method:'GET'|'POST'|'PATCH';readonly pathname:string;readonly query?:boolean;}
export function inStoreRequestAuthorityDecision(request:Request,expectation:InStoreRequestExpectation,panelOrigin:string):'approved'|'method_not_allowed'|'origin_denied'|'invalid_input' {
  try {
    if(!(request instanceof Request))return 'invalid_input';
    if(request.method!==expectation.method)return 'method_not_allowed';
    if(expectation.method!=='GET'&&!hasApprovedPanelMutationOriginShape(request,panelOrigin))return 'origin_denied';
    const url=new URL(request.url);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.pathname!==expectation.pathname||(!expectation.query&&url.search))return 'invalid_input';
    for(const [name] of request.headers)if(name==='authorization'||name.startsWith('x-celebix')||['x-panel-session-credential','x-store-id','x-tenant-id','x-principal-id','x-membership-id','x-plan-id','x-database-role','x-database-url'].includes(name))return 'invalid_input';
    return 'approved';
  }catch{return 'invalid_input';}
}
