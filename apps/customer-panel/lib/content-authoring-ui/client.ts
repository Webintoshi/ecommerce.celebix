import {parseContentAuthoringRequest,parseContentGenerationView,type ContentAuthoringRequest} from '../../../../packages/saas-contracts/src/content-authoring/index.ts';
export class ContentAuthoringApiError extends Error {constructor(readonly code:string){super(code);}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createContentAuthoringClient(fetcher:typeof fetch=fetch){
 async function read(response:Response){let body:unknown;try{body=await response.json();}catch{throw new ContentAuthoringApiError('unavailable');}if(!response.ok){const code=(body as {code?:unknown})?.code;throw new ContentAuthoringApiError(typeof code==='string'&&/^[a-z_]{1,60}$/.test(code)?code:'unavailable');}try{return parseContentGenerationView((body as {generation:unknown}).generation);}catch{throw new ContentAuthoringApiError('invalid_response');}}
 return {
  async generate(request:ContentAuthoringRequest,key:string,signal?:AbortSignal){if(!UUID.test(key))throw new ContentAuthoringApiError('invalid_request');const parsed=parseContentAuthoringRequest(request);return read(await fetcher('/api/content-ai/generations',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(parsed),signal}));},
  async get(id:string,signal?:AbortSignal){if(!UUID.test(id))throw new ContentAuthoringApiError('invalid_request');return read(await fetcher(`/api/content-ai/generations/${encodeURIComponent(id)}`,{credentials:'same-origin',signal}));},
 };
}
export const contentAuthoringClient=createContentAuthoringClient();
