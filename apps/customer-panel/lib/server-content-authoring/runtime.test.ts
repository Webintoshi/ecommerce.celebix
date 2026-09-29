import assert from 'node:assert/strict';
import test from 'node:test';
import { assertContentAuthoringPreferences, contentAuthoringEnabled } from './runtime.ts';
const record=(enabledFeatures:unknown)=>({kind:'ai_setting',status:'active',config:{enabledFeatures}})as any;
test('existing connection users without legacy preferences can author enabled fields',()=>assert.doesNotThrow(()=>assertContentAuthoringPreferences([],['description','seoTitle'])));
test('explicit preference disables selected purpose before authoring',()=>assert.throws(()=>assertContentAuthoringPreferences([record(['seo_suggestions'])],['description']),(e:any)=>e.code==='feature_unavailable'));
test('explicit matching preferences enable description and SEO together',()=>assert.doesNotThrow(()=>assertContentAuthoringPreferences([record(['description_suggestions','seo_suggestions'])],['description','seoDescription'])));
test('multiple or malformed preference records are unavailable',()=>{for(const settings of [[record('seo_suggestions')],[record(['seo_suggestions']),record(['description_suggestions'])]])assert.throws(()=>assertContentAuthoringPreferences(settings,['seoTitle']),(e:any)=>e.code==='unavailable');});
test('rollout stays disabled except opted in store or explicit global enable',()=>{const id='72000000-0000-4000-8000-000000000001';assert.equal(contentAuthoringEnabled(id,{}),false);assert.equal(contentAuthoringEnabled(id,{CONTENT_AUTHORING_ENABLED_STORE_IDS:id}),true);assert.equal(contentAuthoringEnabled(id,{CONTENT_AUTHORING_ENABLED_STORE_IDS:'other'}),false);assert.equal(contentAuthoringEnabled(id,{CONTENT_AUTHORING_ENABLED:'true'}),true);});
