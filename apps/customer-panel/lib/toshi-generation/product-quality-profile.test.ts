import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import * as generationPolicy from './policy.ts';
import {createToshiGenerationRegistry} from './registry.ts';
import {ToshiGenerationError,type ToshiGenerationInput} from './types.ts';

const SECRET='product-quality-test-key';
const REASONING='private-provider-reasoning-never-return-or-retain';
const FINAL='{"description":[{"type":"paragraph","children":[{"type":"text","text":"Ürün açıklaması"}]}],"claims":[],"suggestions":[]}';
const base=(changes:Partial<ToshiGenerationInput>={}):ToshiGenerationInput=>({
 authoringProfile:'product_quality',outputFormat:'json_object',model:'deepseek-flash',secret:new TextEncoder().encode(SECRET),system:'Return the final product JSON object only.',history:[{role:'user',text:'Prepare the requested product fields.'}],tools:[],signal:new AbortController().signal,...changes,
});
const reply=()=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:FINAL,reasoning_content:REASONING}}],usage:{prompt_tokens:250,completion_tokens:1400,completion_tokens_details:{reasoning_tokens:1200}}});

test('product quality enables thinking with low reasoning effort with a 12288-token default and only returns final JSON with full completion usage',async()=>{
 const requests:{url:string;init:RequestInit;body:Record<string,any>}[]=[];
 const adapter=createToshiGenerationRegistry({deepseek:async(url,init)=>{requests.push({url:String(url),init,body:JSON.parse(String(init.body))});return reply();}}).get('deepseek');
 const result=await adapter.generate(base());
 assert.equal(requests.length,1);assert.equal(requests[0]!.url,'https://api.deepseek.com/chat/completions');assert.equal(requests[0]!.init.redirect,'error');assert.equal(requests[0]!.init.cache,'no-store');assert.ok(requests[0]!.init.signal instanceof AbortSignal);
 assert.deepEqual(requests[0]!.body.thinking,{type:'enabled'});assert.equal(requests[0]!.body.reasoning_effort,'low');assert.equal(requests[0]!.body.max_tokens,12288);assert.deepEqual(requests[0]!.body.response_format,{type:'json_object'});assert.equal(requests[0]!.body.tools,undefined);assert.equal(requests[0]!.body.stream,false);
 assert.equal(result.text,FINAL);assert.deepEqual(result.toolCalls,[]);assert.deepEqual(result.usage,{inputTokens:250,outputTokens:1400});assert.doesNotMatch(JSON.stringify(result),new RegExp(REASONING));assert.equal(JSON.stringify(result.continuation),'{}');
 await assert.rejects(adapter.generate(base({continuation:result.continuation})),{code:'invalid_input'});assert.equal(requests.length,1,'quality cannot continue or replay hidden protocol state');
});

test('quality permits bounded explicit output tokens and correction histories without adding reasoning to messages',async()=>{
 const bodies:Record<string,any>[]=[];const adapter=createToshiGenerationRegistry({deepseek:async(_url,init)=>{bodies.push(JSON.parse(String(init.body)));return reply();}}).get('deepseek');
 await adapter.generate(base({maxOutputTokens:8192,history:[{role:'user',text:'Initial facts'},{role:'assistant',text:'{"invalid":true}'},{role:'user',text:'Return corrected JSON only.'}]}));
 await adapter.generate(base({maxOutputTokens:12288}));
 assert.deepEqual(bodies.map(body=>body.max_tokens),[8192,12288]);assert.deepEqual(bodies[0]!.messages.slice(1),[{role:'user',content:'Initial facts'},{role:'assistant',content:'{"invalid":true}'},{role:'user',content:'Return corrected JSON only.'}]);assert.doesNotMatch(JSON.stringify(bodies[0]),/reasoning_content/);
});

test('quality rejects unsupported providers and models before any dispatch',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return reply();};const registry=createToshiGenerationRegistry({deepseek:fetcher,openai:fetcher,gemini:fetcher,anthropic:fetcher});
 for(const [provider,model]of [['deepseek','deepseek-v4-pro'],['openai','gpt-5-mini'],['gemini','gemini-2.5-flash'],['anthropic','claude-sonnet-4-6']]as const)await assert.rejects(registry.get(provider).generate(base({model})),{code:'model_unavailable'});
 assert.equal(calls,0);
});

test('quality rejects tools, non-JSON mode, continuation, results and token/input overflow before dispatch',async()=>{
 let calls=0;const adapter=createToshiGenerationRegistry({deepseek:async()=>{calls++;return reply();}}).get('deepseek');
 const invalid:Partial<ToshiGenerationInput>[]=[{outputFormat:undefined},{outputFormat:'text' as any},{tools:[{name:'search',description:'Search',parameters:{type:'object'}}]},{continuation:{}},{continuation:null},{toolResults:[]},{maxOutputTokens:12289},{maxOutputTokens:0},{maxOutputTokens:1.5},{system:'a'.repeat(24001)},{history:[{role:'user',text:'ğ'.repeat(16385)}]}];
 for(const changes of invalid)await assert.rejects(adapter.generate(base(changes)),{code:'invalid_input'});assert.equal(calls,0);
});

test('legacy JSON and content resource paths keep thinking disabled and their existing output budgets',async()=>{
 const bodies:Record<string,any>[]=[];const adapter=createToshiGenerationRegistry({deepseek:async(_url,init)=>{bodies.push(JSON.parse(String(init.body)));return reply();}}).get('deepseek');
 await adapter.generate(base({authoringProfile:undefined}));await adapter.generate(base({authoringProfile:'content_resource',maxOutputTokens:8192}));
 assert.deepEqual(bodies.map(body=>body.thinking),[{type:'disabled'},{type:'disabled'}]);assert.deepEqual(bodies.map(body=>body.max_tokens),[4096,8192]);assert.equal(bodies.every(body=>body.reasoning_effort===undefined),true);
 await assert.rejects(adapter.generate(base({authoringProfile:undefined,maxOutputTokens:4097})),{code:'invalid_input'});
 await assert.rejects(adapter.generate(base({authoringProfile:'content_resource',maxOutputTokens:8193})),{code:'invalid_input'});assert.equal(bodies.length,2);
});

test('quality preserves MIME, response size, secret echo, truncation and deadline protections',async()=>{
 for(const response of [new Response('{}',{headers:{'content-type':'text/html'}}),Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:FINAL,reasoning_content:SECRET}}]}),Response.json({choices:[{finish_reason:'length',message:{role:'assistant',content:'{"partial":',reasoning_content:REASONING}}]}),Response.json({}, {headers:{'content-length':'524289'}})]){
  let calls=0;const adapter=createToshiGenerationRegistry({deepseek:async()=>{calls++;return response;}}).get('deepseek');await assert.rejects(adapter.generate(base()),error=>error instanceof ToshiGenerationError&&error.code==='provider_unavailable'&&!String(error).includes(REASONING)&&!String(error).includes(SECRET));assert.equal(calls,1);
 }
 const controller=new AbortController();controller.abort();let calls=0;const adapter=createToshiGenerationRegistry({deepseek:async()=>{calls++;return reply();}}).get('deepseek');await assert.rejects(adapter.generate(base({signal:controller.signal})),{code:'provider_timeout'});assert.equal(calls,0);
});

test('quality protocol state stores only final assistant role and content without reasoning',async()=>{
 const source=await readFile(new URL('./deepseek.ts',import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const compiled={exports:{} as {createDeepSeekGenerationAdapter:typeof import('./deepseek.ts').createDeepSeekGenerationAdapter}};
 let retainedMessages:readonly unknown[]=[];
 Function('require','module','exports',output)((name:string)=>{
  assert.equal(name,'./policy.ts');
  return {...generationPolicy,adapter:(provider:'deepseek',protocol:generationPolicy.Protocol)=>generationPolicy.adapter(provider,async(...args)=>{const result=await protocol(...args);retainedMessages=result.messages;return result;})};
 },compiled,compiled.exports);
 await compiled.exports.createDeepSeekGenerationAdapter(async()=>reply()).generate(base());
 assert.deepEqual(retainedMessages.at(-1),{role:'assistant',content:FINAL});assert.doesNotMatch(JSON.stringify(retainedMessages),new RegExp(REASONING));assert.doesNotMatch(JSON.stringify(retainedMessages),/reasoning_content/);
});
