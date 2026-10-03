import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedBody,BodyTooLarge} from './body.ts';
test('counts actual bytes without trusting absent or forged Content-Length',async()=>{
 assert.equal(new TextDecoder().decode(await readBoundedBody(new Request('https://owner.test',{method:'POST',body:'abc'}),3)),'abc');
 await assert.rejects(readBoundedBody(new Request('https://owner.test',{method:'POST',headers:{'content-length':'1'},body:'ışık'}),4),BodyTooLarge);
 await assert.rejects(readBoundedBody(new Request('https://owner.test',{method:'POST',headers:{'content-length':'10000'},body:'a'}),4),BodyTooLarge);
});
