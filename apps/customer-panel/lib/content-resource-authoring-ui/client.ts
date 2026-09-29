import{parseContentResourceAuthoringRequest,parseContentResourceGenerationView,type ContentResourceAuthoringRequest}from'@celebix/saas-contracts';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class ContentResourceAuthoringApiError extends Error{constructor(readonly code:string){super(code);this.name='ContentResourceAuthoringApiError';}}
export function createContentResourceAuthoringClient(fetcher:typeof fetch=fetch){
 async function read(response:Response){let body:unknown;try{body=await response.json();}catch{throw new ContentResourceAuthoringApiError('unavailable');}if(!response.ok){const code=(body as {code?:unknown})?.code;throw new ContentResourceAuthoringApiError(typeof code==='string'&&/^[a-z_]{1,60}$/.test(code)?code:'unavailable');}try{return parseContentResourceGenerationView((body as {generation:unknown}).generation);}catch{throw new ContentResourceAuthoringApiError('invalid_response');}}
 return Object.freeze({
  async generate(request:ContentResourceAuthoringRequest,key:string,signal?:AbortSignal){if(!UUID.test(key))throw new ContentResourceAuthoringApiError('invalid_request');const parsed=parseContentResourceAuthoringRequest(request);return read(await fetcher('/api/content-resource-authoring',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(parsed),signal}));},
  async get(id:string,signal?:AbortSignal){if(!UUID.test(id))throw new ContentResourceAuthoringApiError('invalid_request');return read(await fetcher(`/api/content-resource-authoring/${encodeURIComponent(id)}`,{credentials:'same-origin',signal}));},
 });
}
export const contentResourceAuthoringClient=createContentResourceAuthoringClient();
