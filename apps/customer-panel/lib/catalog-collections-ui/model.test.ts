import assert from 'node:assert/strict';
import test from 'node:test';
import { applySelection, moveProduct, collectionDraft, draftFingerprint, validateDraft, nextCollectionSlug } from './model.ts';

test('moves preserve every unseen ID and support first position across pages', () => {
 const ids=Array.from({length:125},(_,i)=>`p${i}`);
 assert.deepEqual(moveProduct(ids,'p124',0), ['p124',...ids.slice(0,124)]);
 assert.deepEqual(moveProduct(ids,'p99',98).slice(97,101),['p97','p99','p98','p100']);
 assert.deepEqual(moveProduct(ids,'missing',0),ids);
 assert.deepEqual(moveProduct(ids,'p0',-1),ids);
});
test('selection preserves existing order and unseen links, appends only new selections',()=>{
 assert.deepEqual(applySelection(['unseen','a','b'],new Set(['unseen','b','c'])),['unseen','b','c']);
});
test('automatic pin order never synthesizes membership and retains unmatched historical pins',()=>{
 assert.deepEqual(moveProduct(['a','b','c'],'c',0,['gone','b']),['c','a','b','gone']);
});
test('new and legacy collection edits default to published without losing IDs',()=>{
 const draft=collectionDraft({name:'Yaz',slug:'yaz',config:{featured:true},productIds:['a','b']});
 assert.equal(draft.mode,'manual');assert.equal(draft.publicationStatus,'published');assert.equal(draft.featured,true);assert.deepEqual(draft.productIds,['a','b']);
 assert.equal(draftFingerprint(draft),draftFingerprint({...draft}));
});
test('automatic rules are required, complete and bounded; names required',()=>{
 const draft=collectionDraft();assert.equal(validateDraft(draft).name,'Koleksiyon adını girin.');
 assert.ok(validateDraft({...draft,name:'Yeni',mode:'automatic'}).rules);
 assert.ok(validateDraft({...draft,name:'Yeni',mode:'automatic',rules:[{kind:'category',resourceId:''}]}).rules);
 assert.equal(Object.keys(validateDraft({...draft,name:'Yeni',mode:'automatic',rules:[{kind:'category',resourceId:'cat'}]})).length,0);
});
test('collection slugs are normalized and unique without exceeding the limit',()=>{
 assert.equal(nextCollectionSlug('Şehir Koleksiyonu',new Set(['sehir-koleksiyonu'])),'sehir-koleksiyonu-2');
 assert.equal(nextCollectionSlug('a'.repeat(130),new Set(['a'.repeat(120)])).length,120);
});
