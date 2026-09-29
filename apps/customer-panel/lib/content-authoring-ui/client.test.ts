import assert from 'node:assert/strict';
import test from 'node:test';
import {createContentAuthoringClient,ContentAuthoringApiError} from './client.ts';
const id='00000000-0000-4000-8000-000000000001';
const request={draftId:id,productId:null,productVersion:null,profileVersion:null,currentDraft:{title:'Burgu'},action:'create',fields:['description'],locale:'tr-TR',tone:'neutral',length:'medium',note:'',selection:null} as const;
test('generation request sends strict JSON and UUID idempotency key and safe errors',async()=>{let seen:RequestInit|undefined;const api=createContentAuthoringClient(async(_url,init)=>{seen=init;return new Response(JSON.stringify({code:'connection_missing'}),{status:409});});await assert.rejects(api.generate(request,id), (error:unknown)=>error instanceof ContentAuthoringApiError&&error.code==='connection_missing');assert.equal((seen?.headers as Record<string,string>)['idempotency-key'],id);assert.deepEqual(JSON.parse(seen?.body as string),request);});
