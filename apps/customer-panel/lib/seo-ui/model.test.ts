import assert from 'node:assert/strict';
import test from 'node:test';
import { mutationIdentity, notificationLabel, legacySeoDestination } from './model.ts';

test('same failed payload retains operation identity; a changed payload receives a new identity',()=>{
 let calls=0;const uuid=()=>`op-${++calls}`;
 const first=mutationIdentity(null,'/api/seo/settings',{title:'First'},uuid);
 assert.equal(mutationIdentity(first,'/api/seo/settings',{title:'First'},uuid).key,first.key);
 assert.notEqual(mutationIdentity(first,'/api/seo/settings',{title:'Changed'},uuid).key,first.key);
 assert.notEqual(mutationIdentity(first,'/api/seo/links',{title:'First'},uuid).key,first.key);
});
test('notification acknowledgement never promises indexing',()=>{
 assert.equal(notificationLabel({status:'received',httpStatus:200}),'IndexNow aldı · HTTP 200');
 assert.equal(notificationLabel({status:'verification_pending',httpStatus:202}),'Anahtar doğrulaması bekleniyor · HTTP 202');
 assert.doesNotMatch(notificationLabel({status:'received',httpStatus:200}),/indekslendi|Google/);
});
test('legacy resources preserve kind and resolve safe resource identity without carrying tenant authority',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal(legacySeoDestination('products',id),`/seo/content?kind=product&resourceId=${id}`);
 assert.equal(legacySeoDestination('categories','bad'),'/seo/content?kind=category');
 assert.equal(legacySeoDestination('internal-linking'),'/seo?tab=links');
 assert.equal(legacySeoDestination('fast-indexing'),'/seo?tab=notifications');
 assert.equal(legacySeoDestination('social-preview'),'/seo/settings');
});
