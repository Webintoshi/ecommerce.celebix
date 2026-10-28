import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const source=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const manifest=JSON.parse(source('phase-toshi-public-test-checkout-manifest.json'))as{artifacts:Array<{file:string;sha256:string}>};
test('public paid-gift migration binds the exact reviewed schema and financial guard artifacts',()=>{
 assert.equal(manifest.artifacts.length,3);
 for(const artifact of manifest.artifacts)assert.equal(createHash('sha256').update(source(artifact.file)).digest('hex'),artifact.sha256,artifact.file);
});
