import {readToshiCredits,parseToshiWallet,type ToshiWallet} from './credits-client.ts';
import type {AuthoringImageAlt} from './image-alts.ts';
import {parseContentAuthoringRequest,parseContentGenerationView,type ContentAuthoringRequest} from '../../../../packages/saas-contracts/src/content-authoring/index.ts';
export class ContentAuthoringApiError extends Error {constructor(readonly code:string){super(code);}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createContentAuthoringClient(fetcher:typeof fetch=fetch){
 async function read(response:Response){let body:unknown;try{body=await response.json();}catch{throw new ContentAuthoringApiError('unavailable');}if(!response.ok){const code=(body as {code?:unknown})?.code;throw new ContentAuthoringApiError(typeof code==='string'&&/^[a-z_]{1,60}$/.test(code)?code:'unavailable');}try{return parseContentGenerationView((body as {generation:unknown}).generation);}catch{throw new ContentAuthoringApiError('invalid_response');}}
 return {
  credits:(signal?:AbortSignal)=>readToshiCredits(signal,fetcher),
  async imageAlts(request:Readonly<{draftId:string;productId:string|null;context:Readonly<{title:string;description?:string}>;images:readonly Readonly<{id:string;dataUrl:string;variantLabel?:string}>[]}>,key:string,signal?:AbortSignal):Promise<Readonly<{results:readonly AuthoringImageAlt[];failedIds:readonly string[];chargedCredits:number;wallet:ToshiWallet}>> {
   if(!UUID.test(key)||request.images.length<1||request.images.length>4||new Set(request.images.map(image=>image.id)).size!==request.images.length)throw new ContentAuthoringApiError('invalid_request');
   const response=await fetcher('/api/content-ai/image-alts',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(request),signal});
   const body=await response.json();if(!response.ok)throw new ContentAuthoringApiError(typeof body.code==='string'&&/^[a-z_]{1,60}$/.test(body.code)?body.code:'unavailable');
   const ids=new Set(request.images.map(image=>image.id));if(!Array.isArray(body.results)||!Array.isArray(body.failedIds)||!Number.isSafeInteger(body.chargedCredits)||body.chargedCredits<0||!body.results.every((item:AuthoringImageAlt)=>ids.has(item.id)&&typeof item.altText==='string'&&item.altText.trim().length>0&&item.altText.length<=500)||new Set(body.results.map((item:AuthoringImageAlt)=>item.id)).size!==body.results.length||!body.failedIds.every((id:unknown)=>typeof id==='string'&&ids.has(id))||new Set([...body.results.map((item:AuthoringImageAlt)=>item.id),...body.failedIds]).size!==request.images.length||body.results.length+body.failedIds.length!==request.images.length||body.chargedCredits>body.results.length)throw new ContentAuthoringApiError('invalid_response');
   return {...body,wallet:parseToshiWallet(body.wallet)};
  },
  async generate(request:ContentAuthoringRequest,key:string,signal?:AbortSignal){if(!UUID.test(key))throw new ContentAuthoringApiError('invalid_request');const parsed=parseContentAuthoringRequest(request);return read(await fetcher('/api/content-ai/generations',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(parsed),signal}));},
  async get(id:string,signal?:AbortSignal){if(!UUID.test(id))throw new ContentAuthoringApiError('invalid_request');return read(await fetcher(`/api/content-ai/generations/${encodeURIComponent(id)}`,{credentials:'same-origin',signal}));},
 };
}
export const contentAuthoringClient=createContentAuthoringClient();
