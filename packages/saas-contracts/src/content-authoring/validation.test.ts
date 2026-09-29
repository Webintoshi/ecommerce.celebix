import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContentAuthoringRequest, validateProductDraftOutput } from './validation.ts';
const id = '11111111-1111-4111-8111-111111111111';
export const request = { draftId: id, productId: null, productVersion: null, profileVersion: null, currentDraft: { title: 'Burgu' }, action: 'create', fields: ['description'], locale: 'tr-TR', tone: 'neutral', length: 'short', note: '', selection: null };
test('title alone is valid; privileged and unknown fields rejected', () => { assert.equal(parseContentAuthoringRequest(request).currentDraft.title, 'Burgu'); assert.throws(() => parseContentAuthoringRequest({ ...request, storeId: id })); assert.throws(() => parseContentAuthoringRequest({ ...request, currentDraft: { title: 'Burgu', stockQuantity: 250 } })); });
const packet = { title: 'Burgu', sourceFingerprint: 'fingerprint', facts: [{ ref: 'weight', field: 'weight', value: '0.25', unit: 'kg', scope: 'product', source: 'current_draft' }] } as const;
const output = { description: [{ type: 'paragraph', children: [{ type: 'fact', factRef: 'weight', value: '0.25', unit: 'kg' }] }], suggestions: [], claims: [], sourceFingerprint: 'fingerprint' };
test('structured quantity and unit retain exact magnitude', () => { assert.equal(validateProductDraftOutput(output, packet, ['description']).description?.length, 1); for (const replacement of [{ value: '250', unit: 'g' }, { value: '250', unit: 'stock' }, { value: '14', unit: 'karat' }])
    assert.throws(() => validateProductDraftOutput({ ...output, description: [{ type: 'paragraph', children: [{ type: 'fact', factRef: 'weight', ...replacement }] }] }, packet, ['description'])); });
test('unsupported claims, links, confidence and stale fingerprints are rejected', () => { for (const change of [{ claims: [{ field: 'description', factRef: 'stone', value: 'diamond' }] }, { confidence: 1 }, { sourceFingerprint: 'stale' }, { seoTitle: 'unselected' }, { description: [{ type: 'paragraph', children: [{ type: 'link', href: 'https://example.com', text: 'x' }] }] }])
    assert.throws(() => validateProductDraftOutput({ ...output, ...change }, packet, ['description'])); });
test('attribute claims cannot invent karat or stone from title-only source', () => { const empty = { title: 'Burgu', facts: [], sourceFingerprint: 'fingerprint' }; for (const field of ['karat', 'stone'])
    assert.throws(() => validateProductDraftOutput({ ...output, description: [{ type: 'paragraph', children: [{ type: 'fact', factRef: field, value: field === 'karat' ? '14' : 'diamond' }] }] }, empty, ['description'])); });
import { parseContentGenerationView } from './validation.ts';
const hash='a'.repeat(64),time='2026-09-29T10:00:00.000Z';
const pending={id,draftId:id,productId:null,status:'pending',draft:null,sourceFingerprint:hash,usage:null,safeCode:null,createdAt:time,updatedAt:time,finishedAt:null};
test('generation response parses safe pending/completed shape without provider facts',()=>{assert.deepEqual(parseContentGenerationView(pending),pending);const completed={...pending,status:'completed',finishedAt:time,draft:{seoTitle:'Burgu',suggestions:[],claims:[],sourceFingerprint:hash},usage:{inputTokens:5,outputTokens:4,totalTokens:9}};assert.deepEqual(parseContentGenerationView(completed),completed);});
test('generation response rejects private fields and inconsistent lifecycle/usage/hash/timestamps',()=>{for(const change of [{credentialVersion:1},{claimToken:id},{status:'completed'},{draft:output},{finishedAt:time},{usage:{inputTokens:2,outputTokens:3,totalTokens:4}},{usage:{inputTokens:-1,outputTokens:3,totalTokens:2}},{sourceFingerprint:'bad'},{updatedAt:'2026-02-30T00:00:00.000Z'},{updatedAt:'2025-09-29T10:00:00.000Z'},{safeCode:'Raw provider message'}])assert.throws(()=>parseContentGenerationView({...pending,...change}));});
test('generation draft remains strictly shaped and fingerprint bound',()=>{const completed={...pending,status:'completed',finishedAt:time,draft:{seoTitle:'Burgu',suggestions:[],claims:[],sourceFingerprint:hash}};for(const draft of [{...completed.draft,confidence:1},{...completed.draft,seoTitle:'<script>x</script>'},{...completed.draft,sourceFingerprint:'b'.repeat(64)}])assert.throws(()=>parseContentGenerationView({...completed,draft}));});

test('selected generated fields require visible content in their rendered text containers',()=>{
 const emptyDescriptions=[[],[{type:'paragraph',children:[]}],[{type:'heading',level:2,children:[]}],[{type:'list',ordered:false,items:[]}],[{type:'table',rows:[[[]]]}],...[' \t\n\u00a0','\u200b\u200c\u200d\ufeff','\u034f\u3164\u2800'].map(text=>[{type:'paragraph',children:[{type:'text',text}]}])];
 for(const description of emptyDescriptions)assert.throws(()=>validateProductDraftOutput({...output,description},packet,['description']),JSON.stringify(description));
 for(const field of ['seoTitle','seoDescription'] as const)for(const invisible of ['   ','\u200b\ufeff','\u034f\u3164\u2800'])assert.throws(()=>validateProductDraftOutput({[field]:invisible,suggestions:[],claims:[],sourceFingerprint:packet.sourceFingerprint},packet,[field]));
 for(const description of [[{type:'list',ordered:false,items:[[{type:'text',text:'Burgu'}]]}],[{type:'table',rows:[[[{type:'text',text:'Burgu'}]]]}]])assert.doesNotThrow(()=>validateProductDraftOutput({...output,description},packet,['description']));
 assert.throws(()=>validateProductDraftOutput({...output,seoTitle:'\u200b'},packet,['description','seoTitle']),'each selected field must be usable');
});
