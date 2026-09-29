import assert from 'node:assert/strict';
import test from 'node:test';
import {contentResearchEnabled} from './flag.ts';
const store='11111111-1111-4111-8111-111111111111';
test('research remains off by default and only explicit global or exact valid store flag enables it',()=>{assert.equal(contentResearchEnabled(store,{}),false);assert.equal(contentResearchEnabled(store,{CONTENT_RESEARCH_ENABLED:'true'}),true);assert.equal(contentResearchEnabled(store,{CONTENT_RESEARCH_ENABLED_STORE_IDS:`bad, ${store} `}),true);assert.equal(contentResearchEnabled('22222222-2222-4222-8222-222222222222',{CONTENT_RESEARCH_ENABLED_STORE_IDS:store}),false);assert.equal(contentResearchEnabled('bad',{CONTENT_RESEARCH_ENABLED_STORE_IDS:'bad'}),false);});
