import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSaveSeoResourceRequest, seoCanonicalPath, parseNotifySeoRequest } from './index.ts';
const id='10000000-0000-4000-8000-000000000001';
test('SEO request accepts native metadata and rejects unsafe canonical paths and repeated submissions',()=>{
 assert.equal(parseSaveSeoResourceRequest({kind:'category',id,expectedVersion:1,expectedSeoVersion:0,title:null,description:null,canonicalPath:'/kategori/test',indexing:'inherit'}).canonicalPath,'/kategori/test');
 for(const v of ['//other.test','/../other','/a/%2e%2e/other','https://other.test','/a#frag','/a?url=x'])assert.throws(()=>seoCanonicalPath(v));
 assert.throws(()=>parseNotifySeoRequest({resources:[{kind:'page',id},{kind:'page',id}]}));
});
