import {createHash} from 'node:crypto';
import {lstatSync,readdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const RECEIPT_RELATIVE_PATH='scripts/signup-release-proof.json';
export const REQUIRED_SUITE_IDS=Object.freeze(['current-signup.native','starter-plan-snapshots255.native']);
export const EXCLUDED_GENERATED_FILES=Object.freeze([
 'packages/payment-adapters/src/providers/paytr/build-metadata.generated.ts',
 'packages/payment-adapters/src/providers/iyzico/build-metadata.generated.ts',
]);
export const REQUIRED_INPUT_PATHS=Object.freeze([
 'AGENTS.md','package.json','package-lock.json','tsconfig.base.json','nixpacks.toml','Dockerfile.storefront',
 '.github/workflows/signup-release-guard.yml','scripts/signup-release-proof.mjs','scripts/signup-release-proof.test.mjs','scripts/rehearse-signup-release.mjs',
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
]);
const DEFAULT_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const EXTENSION=/\.(?:ts|tsx|js|mjs|cjs|json|sql)$/u;
const TEST_FILE=/\.test\.(?:ts|tsx|js|mjs|cjs)$/u;
const FORWARD_SQL=/(?:\.up|\.seed|\.freeze|_grants)\.sql$/u;
const SKIP_DIRECTORIES=new Set(['node_modules','.git','.next','.onboarding-worker','.cache','coverage']);
const HEX=/^[a-f0-9]{64}$/u;
function fail(code){throw new Error('signup_release_proof_'+code);}
function hash(value){return createHash('sha256').update(value).digest('hex');}
function exact(value,keys){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
function normalizedRoot(root){if(typeof root!=='string'||!path.isAbsolute(root))fail('root_invalid');return path.resolve(root);}
function regularFile(root,relative,missing='input_missing'){
 const pieces=relative.split('/');let current=root;
 for(const [index,piece]of pieces.entries()){
  current=path.join(current,piece);let info;try{info=lstatSync(current);}catch{fail(missing);}
  if(info.isSymbolicLink())fail('symlink');
  if(index===pieces.length-1?!info.isFile():!info.isDirectory())fail(missing);
 }
 return current;
}
function sourceFile(relative){
 if(!EXTENSION.test(relative)||TEST_FILE.test(relative)||EXCLUDED_GENERATED_FILES.includes(relative))return false;
 return !relative.endsWith('.sql')||FORWARD_SQL.test(relative);
}
function selectedPanelSource(relative){
 if(!sourceFile(relative))return false;
 const rest=relative.slice('apps/customer-panel/'.length);
 return /^(?:app\/(?:auth|api\/(?:auth|session|merchant-phone))\/|components\/auth\/|lib\/(?:admin-login-security|panel-auth[^/]*|panel-browser-binding|panel-session[^/]*|cross-host-session-handoff|merchant-phone|platform-invitations|server-admin-host-auth|server-panel-session-controls)\/)/u.test(rest)
  || /^(?:middleware\.ts|instrumentation\.ts|lib\/(?:session|panel-origin-authority|cross-host-handoff-http|cross-host-handoff-auto-post|cross-host-handoff-default)\.ts)$/u.test(rest);
}
function collect(root,relative,selected,include){
 const absolute=path.join(root,relative);let info;try{info=lstatSync(absolute);}catch{fail('input_missing');}
 if(info.isSymbolicLink())fail('symlink');
 if(info.isDirectory()){
  for(const name of readdirSync(absolute).sort()){
   if(SKIP_DIRECTORIES.has(name))continue;
   collect(root,relative+'/'+name,selected,include);
  }
 }else if(info.isFile()&&include(relative))selected.add(relative);
}
function digestInputs(inputs){return hash(JSON.stringify({schemaVersion:1,postgresMajor:16,suites:REQUIRED_SUITE_IDS,inputs}));}

/** Discover source on disk, including new untracked migrations; never trust Git's file list. */
export function gatherInputs(root=DEFAULT_ROOT){
 root=normalizedRoot(root);const selected=new Set(REQUIRED_INPUT_PATHS);
 for(const name of REQUIRED_INPUT_PATHS)regularFile(root,name);
 collect(root,'apps/owner',selected,sourceFile);
 collect(root,'packages',selected,sourceFile);
 collect(root,'apps/customer-panel',selected,selectedPanelSource);
 for(const name of readdirSync(path.join(root,'apps')).sort()){
  if(SKIP_DIRECTORIES.has(name))continue;
  const directory=path.join(root,'apps',name),info=lstatSync(directory);
  if(info.isSymbolicLink())fail('symlink');
  if(!info.isDirectory())continue;
  const packagePath='apps/'+name+'/package.json';
  try{lstatSync(path.join(root,packagePath));selected.add(packagePath);}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 const scripts=path.join(root,'scripts');
 for(const name of readdirSync(scripts).sort())if(/^signup-.*\.mjs$/u.test(name))selected.add('scripts/'+name);
 const inputs=[...selected].sort().map(relative=>Object.freeze({path:relative,sha256:hash(readFileSync(regularFile(root,relative)))}));
 return Object.freeze({inputs:Object.freeze(inputs),inputDigest:digestInputs(inputs)});
}
function validateReceipt(receipt){
 if(!exact(receipt,['schemaVersion','postgresMajor','suites','inputDigest','inputs'])||receipt.schemaVersion!==1||receipt.postgresMajor!==16||!Array.isArray(receipt.suites)||JSON.stringify(receipt.suites)!==JSON.stringify(REQUIRED_SUITE_IDS)||!HEX.test(receipt.inputDigest)||!Array.isArray(receipt.inputs)||receipt.inputs.length===0)fail('invalid_receipt');
 let previous='';
 for(const item of receipt.inputs){
  if(!exact(item,['path','sha256'])||typeof item.path!=='string'||item.path<=previous||item.path.startsWith('/')||item.path.includes('\\')||item.path.split('/').some(p=>!p||p==='.'||p==='..')||!HEX.test(item.sha256))fail('invalid_receipt');
  previous=item.path;
 }
 if(receipt.inputDigest!==digestInputs(receipt.inputs))fail('invalid_receipt');
 return receipt;
}
/** Build-time check: no PostgreSQL, credentials, network, environment exemptions or writes. */
export function checkReceipt(root=DEFAULT_ROOT){
 root=normalizedRoot(root);const location=regularFile(root,RECEIPT_RELATIVE_PATH,'missing_receipt');let receipt;
 try{receipt=JSON.parse(readFileSync(location,'utf8'));}catch{fail('invalid_receipt');}
 validateReceipt(receipt);const current=gatherInputs(root);
 if(receipt.inputDigest!==current.inputDigest||JSON.stringify(receipt.inputs)!==JSON.stringify(current.inputs))fail('stale');
 return receipt;
}
/** Only the successful rehearsal runner calls this API; there is deliberately no write CLI. */
export function writeReceipt(root,proofRuns,testedSnapshot){
 root=normalizedRoot(root);
 if(!Array.isArray(proofRuns)||proofRuns.length!==REQUIRED_SUITE_IDS.length||proofRuns.some((run,index)=>!exact(run,['id','exitCode','postgresMajor'])||run.id!==REQUIRED_SUITE_IDS[index]||run.exitCode!==0||run.postgresMajor!==16))fail('invalid_runs');
 // Persist only the bytes whose native suites passed. A newly gathered digest
 // must never authorize different source after the runner's final comparison.
 if(!exact(testedSnapshot,['inputs','inputDigest'])||!Object.isFrozen(testedSnapshot)||!Array.isArray(testedSnapshot.inputs)||!Object.isFrozen(testedSnapshot.inputs)||testedSnapshot.inputs.some(item=>!Object.isFrozen(item)))fail('invalid_snapshot');
 const receipt={schemaVersion:1,postgresMajor:16,suites:[...REQUIRED_SUITE_IDS],inputDigest:testedSnapshot.inputDigest,inputs:testedSnapshot.inputs};
 try{validateReceipt(receipt);}catch{fail('invalid_snapshot');}
 const current=gatherInputs(root);
 if(current.inputDigest!==testedSnapshot.inputDigest||JSON.stringify(current.inputs)!==JSON.stringify(testedSnapshot.inputs))fail('stale');
 const location=path.join(root,RECEIPT_RELATIVE_PATH),temporary=location+'.tmp-'+process.pid;
 try{
  try{const info=lstatSync(location);if(info.isSymbolicLink())fail('symlink');if(!info.isFile())fail('invalid_receipt');}catch(error){if(error.code!=='ENOENT')throw error;}
  writeFileSync(temporary,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o644});renameSync(temporary,location);
 }finally{try{unlinkSync(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
 return receipt;
}
let invoked=null;
if(process.argv[1]!==undefined&&process.argv[1]!=='-'){try{invoked=pathToFileURL(realpathSync(process.argv[1])).href;}catch{/* Imported modules have no executable entry to validate. */}}
if(invoked===import.meta.url){
 try{
  if(process.argv.length>3||(process.argv.length===3&&process.argv[2]!=='--check'))fail('arguments');
  const receipt=checkReceipt();console.info(JSON.stringify({code:'signup_release_proof_verified',inputDigest:receipt.inputDigest,inputCount:receipt.inputs.length,postgresMajor:16,suites:receipt.suites}));
 }catch(error){console.error(error instanceof Error&&/^signup_release_proof_[a-z_]+$/u.test(error.message)?error.message:'signup_release_proof_unavailable');process.exitCode=1;}
}
