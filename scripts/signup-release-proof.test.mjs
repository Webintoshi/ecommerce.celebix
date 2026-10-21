import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {gatherInputs,checkReceipt,writeReceipt} from './signup-release-proof.mjs';

const required=[
 'AGENTS.md','package.json','package-lock.json','tsconfig.base.json','nixpacks.toml','Dockerfile.storefront',
 '.github/workflows/signup-release-guard.yml','scripts/signup-release-proof.mjs','scripts/signup-release-proof.test.mjs','scripts/rehearse-signup-release.mjs',
 'scripts/verify-signup-edge.mjs','scripts/verify-signup-edge.test.mjs',
 'scripts/verify-tenant-wildcard-readiness.mjs','scripts/verify-tenant-wildcard-readiness.test.mjs',
 'scripts/tenant-wildcard-routes.mjs','scripts/tenant-wildcard-routes.test.mjs',
 'scripts/tenant-wildcard-certificates.py','scripts/tenant-wildcard-certificates.test.py',
 'apps/owner/package.json','apps/customer-panel/package.json','apps/storefront-shared/package.json',
 'apps/owner/lib/merchant-whatsapp/registration.ts','apps/owner/scripts/sql/saas/202610200255_starter_tenant_plan_snapshots.up.sql',
 'apps/owner/scripts/sql/saas/202610200255_starter_tenant_plan_snapshots.down.sql',
 'apps/owner/scripts/sql/saas/202610200255_starter_tenant_plan_snapshots_assertions.sql',
 'apps/owner/scripts/sql/saas/202610150238_merchant_signup_profile_assertions.sql',
 'packages/saas-contracts/src/commercial-packages/catalog.ts','packages/saas-data/src/postgres/repository.ts','packages/saas-tenant-core/src/create-starter-tenant.ts',
 'apps/customer-panel/lib/panel-session-completion/completion.ts',
 'tests/saas-phase3/merchant-signup-profile/current-signup.native.test.mjs','tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs',
 'tests/saas-phase3/merchant-signup-profile/starter-plan-snapshots255.native.test.mjs',
 'tests/saas-phase3/admin-login-security/baseline.mjs','tests/saas-phase3/admin-login-security/baseline-manifest.json',
];
const runs=()=>[{id:'current-signup.native',exitCode:0,postgresMajor:16},{id:'starter-plan-snapshots255.native',exitCode:0,postgresMajor:16}];
function put(root,name,value='fixture source\n'){const p=path.join(root,name);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,value);}
function fixture(t){const root=mkdtempSync(path.join(tmpdir(),'signup-proof-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));for(const p of required)put(root,p);return root;}
function receipt(root){return JSON.parse(readFileSync(path.join(root,'scripts/signup-release-proof.json'),'utf8'));}

test('a truthful two-suite receipt passes deterministically and covers independent source inventory',t=>{
 const root=fixture(t);const a=gatherInputs(root),b=gatherInputs(root);assert.deepEqual(a,b);assert.deepEqual(a.inputs.map(x=>x.path),[...required].sort());
 const saved=writeReceipt(root,runs(),gatherInputs(root));assert.equal(saved.schemaVersion,1);assert.equal(saved.postgresMajor,16);assert.deepEqual(saved.suites,['current-signup.native','starter-plan-snapshots255.native']);assert.deepEqual(checkReceipt(root),saved);assert.deepEqual(receipt(root),saved);
});
test('changed SQL, catalog, production package or shared authentication code invalidates the exact proof',t=>{
 for(const source of ['apps/owner/scripts/sql/saas/202610200255_starter_tenant_plan_snapshots.up.sql','packages/saas-contracts/src/commercial-packages/catalog.ts','packages/saas-data/src/new-code.ts','apps/customer-panel/lib/panel-session-completion/completion.ts']){
  const root=fixture(t);writeReceipt(root,runs(),gatherInputs(root));put(root,source,'changed');assert.throws(()=>checkReceipt(root),/signup_release_proof_stale/);
 }
});
test('new migrations, new signup scripts, deleted source and changed enforcement inputs cannot reuse an old proof',t=>{
 for(const source of ['apps/owner/scripts/sql/saas/202610210256_new_contract.up.sql','scripts/signup-new-policy.mjs','scripts/rehearse-signup-release.mjs','.github/workflows/signup-release-guard.yml','Dockerfile.storefront','apps/customer-panel/package.json','apps/storefront-new/package.json']){
  const root=fixture(t);writeReceipt(root,runs(),gatherInputs(root));put(root,source,'changed');assert.throws(()=>checkReceipt(root),/signup_release_proof_stale/);
 }
 const root=fixture(t);writeReceipt(root,runs(),gatherInputs(root));rmSync(path.join(root,'packages/saas-data/src/postgres/repository.ts'));assert.throws(()=>checkReceipt(root),/signup_release_proof_input_missing/);
});
test('receipt schema, exact suite identities, digests and complete inventory fail closed',t=>{
 const root=fixture(t);writeReceipt(root,runs(),gatherInputs(root));const valid=receipt(root);
 for(const invalid of [{...valid,schemaVersion:2},{...valid,postgresMajor:17},{...valid,suites:[]},{...valid,suites:['current-signup.native']},{...valid,suites:[...valid.suites,'other']},{...valid,inputs:valid.inputs.slice(1)},{...valid,inputDigest:'0'.repeat(64)},{...valid,skip:true}]){
  put(root,'scripts/signup-release-proof.json',JSON.stringify(invalid));assert.throws(()=>checkReceipt(root),/signup_release_proof_(invalid_receipt|stale)/);
 }
 put(root,'scripts/signup-release-proof.json','{invalid');assert.throws(()=>checkReceipt(root),/signup_release_proof_invalid_receipt/);
 rmSync(path.join(root,'scripts/signup-release-proof.json'));assert.throws(()=>checkReceipt(root),/signup_release_proof_missing_receipt/);
});
test('the writer requires successful exact named PostgreSQL16 suites before producing proof',t=>{
 const root=fixture(t);
 for(const invalid of [[],runs().slice(0,1),[runs()[0],runs()[0]],runs().map(x=>({...x,exitCode:1})),runs().map(x=>({...x,postgresMajor:15})),runs().map(x=>({...x,unknown:true}))])assert.throws(()=>writeReceipt(root,invalid,gatherInputs(root)),/signup_release_proof_invalid_runs/);
 writeReceipt(root,runs(),gatherInputs(root));assert.doesNotThrow(()=>checkReceipt(root));
});
test('only the two mutable payment metadata outputs and known build artifacts are excluded',t=>{
 const root=fixture(t);writeReceipt(root,runs(),gatherInputs(root));
 for(const source of ['packages/payment-adapters/src/providers/paytr/build-metadata.generated.ts','packages/payment-adapters/src/providers/iyzico/build-metadata.generated.ts','apps/owner/.next/server/generated.js','apps/owner/.onboarding-worker/runtime.cjs','packages/saas-data/node_modules/example/index.js','apps/owner/lib/ordinary.test.ts'])put(root,source);
 assert.doesNotThrow(()=>checkReceipt(root));put(root,'packages/saas-data/src/other.generated.ts');assert.throws(()=>checkReceipt(root),/signup_release_proof_stale/);
});
test('symlinked covered source or receipt cannot bypass the inventory',t=>{
 const root=fixture(t);writeReceipt(root,runs(),gatherInputs(root));const source=path.join(root,'packages/saas-data/src/postgres/repository.ts');rmSync(source);symlinkSync(path.join(root,'package.json'),source);assert.throws(()=>checkReceipt(root),/signup_release_proof_symlink/);
 const other=fixture(t);writeReceipt(other,runs(),gatherInputs(other));const file=path.join(other,'scripts/signup-release-proof.json');const saved=readFileSync(file);rmSync(file);put(other,'outside.json',saved);symlinkSync(path.join(other,'outside.json'),file);assert.throws(()=>checkReceipt(other),/signup_release_proof_symlink/);
});
test('CLI has check only, reports missing proof and ignores attempted skip environment bypasses',t=>{
 const root=fixture(t);put(root,'scripts/signup-release-proof.mjs',readFileSync(new URL('./signup-release-proof.mjs',import.meta.url)));
 let result=spawnSync(process.execPath,[path.join(root,'scripts/signup-release-proof.mjs'),'--write'],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/signup_release_proof_arguments/);
 result=spawnSync(process.execPath,[path.join(root,'scripts/signup-release-proof.mjs'),'--check'],{encoding:'utf8',env:{...process.env,SKIP_SIGNUP_RELEASE_PROOF:'1',CI:'true',NODE_ENV:'production'}});assert.notEqual(result.status,0);assert.match(result.stderr,/signup_release_proof_missing_receipt/);
 writeReceipt(root,runs(),gatherInputs(root));result=spawnSync(process.execPath,[path.join(root,'scripts/signup-release-proof.mjs')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/signup_release_proof_verified/);
});

test('programmatic import from stdin performs no CLI check or receipt write',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-'],{encoding:'utf8',input:`await import(${JSON.stringify(new URL('./signup-release-proof.mjs',import.meta.url).href)}); console.log('imported');`});
 assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'imported');
});


test('historical suite SQL dependencies and release instructions cannot change without fresh proof',t=>{
 for(const source of ['AGENTS.md','scripts/verify-signup-edge.mjs','scripts/tenant-wildcard-certificates.py','scripts/tenant-wildcard-routes.mjs','apps/owner/scripts/sql/saas/202610200255_starter_tenant_plan_snapshots.down.sql','apps/owner/scripts/sql/saas/202610200255_starter_tenant_plan_snapshots_assertions.sql','apps/owner/scripts/sql/saas/202610150238_merchant_signup_profile_assertions.sql']){
  const root=fixture(t);writeReceipt(root,runs(),gatherInputs(root));put(root,source,'changed dependency');assert.throws(()=>checkReceipt(root),/signup_release_proof_stale/,source);
 }
});
test('a source change after runner comparison rejects refresh and preserves previous receipt bytes',t=>{
 const root=fixture(t);const tested=gatherInputs(root);writeReceipt(root,runs(),tested);
 const previous=readFileSync(path.join(root,'scripts/signup-release-proof.json'));
 assert.deepEqual(gatherInputs(root),tested);
 put(root,'packages/saas-contracts/src/commercial-packages/catalog.ts','untested source after runner comparison');
 assert.throws(()=>writeReceipt(root,runs(),tested),/signup_release_proof_stale/);
 assert.deepEqual(readFileSync(path.join(root,'scripts/signup-release-proof.json')),previous);
 assert.throws(()=>checkReceipt(root),/signup_release_proof_stale/);
});
test('the writer requires an authentic frozen gather snapshot and never overwrites proof on invalid snapshot',t=>{
 const root=fixture(t);const tested=gatherInputs(root);writeReceipt(root,runs(),tested);
 const previous=readFileSync(path.join(root,'scripts/signup-release-proof.json'));
 for(const invalid of [undefined,null,{},structuredClone(tested),Object.freeze({...tested,inputDigest:'0'.repeat(64)}),Object.freeze({...tested,extra:true}),Object.freeze({...tested,inputs:Object.freeze(tested.inputs.slice(1))})]){
  assert.throws(()=>writeReceipt(root,runs(),invalid),/signup_release_proof_invalid_snapshot/);
  assert.deepEqual(readFileSync(path.join(root,'scripts/signup-release-proof.json')),previous);
 }
});
