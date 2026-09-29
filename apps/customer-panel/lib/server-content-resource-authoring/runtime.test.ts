import assert from'node:assert/strict';
import test from'node:test';
import{contentResourceAuthoringEnabled,contentResearchEnabled,assertContentResourcePreferences}from'./runtime.ts';
const id='11111111-1111-4111-8111-111111111111';
test('resource authoring is default off and store allowlist is exact',()=>{
 assert.equal(contentResourceAuthoringEnabled(id,{}),false);
 assert.equal(contentResourceAuthoringEnabled(id,{CONTENT_RESOURCE_AUTHORING_ENABLED_STORE_IDS:id}),true);
 assert.equal(contentResourceAuthoringEnabled(id,{CONTENT_RESOURCE_AUTHORING_ENABLED_STORE_IDS:id+'x'}),false);
 assert.equal(contentResearchEnabled(id,{}),false);
 assert.equal(contentResearchEnabled(id,{CONTENT_RESEARCH_ENABLED_STORE_IDS:id}),true);
});
test('resource content fields respect existing writing preferences',()=>{
 assert.doesNotThrow(()=>assertContentResourcePreferences([],['body']));
 const setting={kind:'ai_setting',status:'active',config:{enabledFeatures:['description_suggestions']}} as any;
 assert.doesNotThrow(()=>assertContentResourcePreferences([setting],['body','name']));
 assert.throws(()=>assertContentResourcePreferences([setting],['seoTitle']));
 assert.throws(()=>assertContentResourcePreferences([{...setting,status:'draft'}],['body']));
});
