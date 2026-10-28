import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import test from'node:test';
const manifest=JSON.parse(readFileSync(new URL('./phase-toshi-central-binding-manifest.json',import.meta.url),'utf8'))as{artifacts:Array<{file:string;sha256:string}>};
const read=(f:string)=>readFileSync(new URL(f,import.meta.url),'utf8'),up=read('202610270284_toshi_central_binding.up.sql');
test('central binding migration artifacts match reviewed hashes',()=>{assert.equal(manifest.artifacts.length,3);for(const a of manifest.artifacts)assert.equal(createHash('sha256').update(read(a.file)).digest('hex'),a.sha256,a.file);});
test('central binding is fixed, encrypted and isolated from legacy provider permissions',()=>{
 assert.match(up,/'catalog','catalog_admin.manage'/);assert.match(up,/toshi_central_envelope_valid284/);assert.match(up,/'••••oshi'/);assert.match(up,/'deepseek-flash'/);assert.match(up,/centralBinding/);assert.match(up,/is_default,version/);assert.doesNotMatch(up,/CREATE OR REPLACE|UPDATE saas[.]toshi_provider_configs SET[^;]*is_default/);
 assert.match(up,/GRANT EXECUTE ON FUNCTION saas[.]toshi_central_binding_command[^;]*TO celebix_saas_app/);assert.doesNotMatch(up,/GRANT[^;]*TO PUBLIC|configuration[.]manage/);assert.match(read('202610270284_toshi_central_binding.down.sql'),/FORWARD_ONLY/);
});
