import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseStorefrontDesignEditorWorkspace,parseStorefrontDesignApplyMutation} from '@celebix/saas-contracts';

export async function runDirectApplyScenarios(c) {
 const {box,DB,STORE,PRINCIPAL,MEMBERSHIP,PLAN,NOW,MEDIA,ASSET,FOREIGN_ASSET,manual,banner,category,legacy,document,literal,json,scalar,rpc,owner,apply,psql,fingerprint,authority,scenario,home}=c;
 let sequence=0;
 const op=()=>`99000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;
 const current=()=>json(box,`SELECT to_jsonb(row) FROM (SELECT published_version AS version,published_config AS design,draft_config AS draft,draft_version AS "draftVersion",draft_updated_at AS "draftUpdatedAt" FROM saas.storefront_designs WHERE store_id='${STORE}') row;`);
 const call=(id,hash,version,design)=>`saas.storefront_design_apply(${authority()},'${id}','${hash}',${version},${literal(design)})`;
 const initial=current();
 const editor=()=>rpc(box,`saas.storefront_design_editor_get(${authority()})`);
 scenario('179 rollback/reapply before live writes restores legacy APIs',()=>{apply(box,'202609300179_storefront_design_direct_apply.down.sql');apply(box,'202609300179_storefront_design_direct_apply.up.sql');apply(box,'202609300179_storefront_design_direct_apply_assertions.sql');assert.deepEqual(current(),initial);});
 scenario('editor starts from published document and keeps separate media identities',()=>{
  const result=editor();assert.equal(result.outcome,'found');const parsed=parseStorefrontDesignEditorWorkspace(result.result);
  assert.equal(parsed.design.schemaVersion,5);assert.equal('draft' in parsed,false);
  assert.deepEqual(parsed.media.find(item=>item.id===MEDIA).reference,{kind:'media',mediaId:MEDIA});
  assert.deepEqual(parsed.media.find(item=>item.id===ASSET).reference,{kind:'asset',assetId:ASSET});
  assert.equal(parsed.media.some(item=>item.id===FOREIGN_ASSET),false);
 });
 const denied={...banner,slides:[{...banner.slides[0],desktopImage:{kind:'asset',assetId:FOREIGN_ASSET}}]};
 scenario('foreign image reference rejects without changing design or audit',()=>{
  assert.equal(rpc(box,call(op(),fingerprint('foreign'),initial.version,document([denied]))).outcome,'design_publish_invalid');assert.deepEqual(current(),initial);
 });
 const actor=op(),hash=fingerprint('first-live'),firstDesign=document([category,banner,{...category,sectionId:'home_second_category',heading:'Second' },manual]);
 let first;
 scenario('apply atomically updates live design, version, operation and event while preserving draft',()=>{
  first=rpc(box,call(actor,hash,initial.version,firstDesign));assert.equal(first.outcome,'applied');parseStorefrontDesignApplyMutation(first.result);
  assert.deepEqual(current().design,firstDesign);assert.equal(current().version,initial.version+1);assert.deepEqual(current().draft,initial.draft);assert.equal(current().draftVersion,initial.draftVersion);assert.equal(current().draftUpdatedAt,initial.draftUpdatedAt);
  assert.equal(scalar(box,`SELECT count(*) FROM saas.storefront_design_operations WHERE operation_id='${actor}';`),'1');assert.equal(scalar(box,`SELECT count(*) FROM saas.storefront_design_events WHERE id='${actor}';`),'1');
  const publicHome=home();assert.equal(publicHome.result.presentation.schemaVersion,4);assert.deepEqual(publicHome.result.presentation.sections.map(section=>section.sectionId),firstDesign.composition.sections.map(section=>section.sectionId));
 });
 scenario('stale version and operation mismatch leave the publication unchanged',()=>{
  const before=current();assert.equal(rpc(box,call(op(),fingerprint('stale'),initial.version,firstDesign)).outcome,'published_version_conflict');assert.deepEqual(current(),before);
  assert.equal(rpc(box,call(actor,fingerprint('other-payload'),initial.version,firstDesign)).outcome,'operation_mismatch');assert.deepEqual(current(),before);
 });
 scenario('uncommitted apply rolls back configuration, version, event and operation together',()=>{
  const before=current(),id=op(),query=call(id,fingerprint('rollback'),before.version,document([banner]));
  psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM ${query};ROLLBACK;`);assert.deepEqual(current(),before);
  assert.equal(scalar(box,`SELECT count(*) FROM saas.storefront_design_operations WHERE operation_id='${id}';`),'0');
 });
 scenario('old draft save and publish cannot downgrade a V5 publication',()=>{
  const before=current();assert.equal(rpc(box,`saas.storefront_design_save_draft(${authority()},'${op()}','${fingerprint('old-save')}',${before.draftVersion},${literal(legacy)})`).outcome,'published_version_conflict');
  assert.equal(rpc(box,`saas.storefront_design_publish(${authority()},'${op()}','${fingerprint('old-publish')}',${before.draftVersion},${before.version})`).outcome,'published_version_conflict');assert.deepEqual(current(),before);
 });
 const pool=new pg.Pool({host:box.socket,port:box.port,user:'postgres',database:DB,max:2});
 async function transaction(query){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL ROLE celebix_saas_app');const result=(await client.query(`SELECT outcome,result_payload FROM ${query}`)).rows[0];await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
 try {
  const before=current();const left=call(op(),fingerprint('left'),before.version,document([banner])),right=call(op(),fingerprint('right'),before.version,document([manual]));
  const simultaneous=await Promise.all([transaction(left),transaction(right)]);
  scenario('concurrent distinct sessions commit one publication and conflict the other',()=>{assert.deepEqual(simultaneous.map(result=>result.outcome).sort(),['applied','published_version_conflict']);assert.equal(current().version,before.version+1);});
  const version=current().version,id=op(),query=call(id,fingerprint('same-operation'),version,document([banner]));
  const replay=await Promise.all([transaction(query),transaction(query)]);
  scenario('concurrent identical retry commits once and returns the immutable result',()=>{assert.deepEqual(replay.map(result=>result.outcome).sort(),['applied','operation_replayed']);assert.deepEqual(replay[0].result_payload,replay[1].result_payload);assert.equal(current().version,version+1);});
 } finally {await pool.end();}
 scenario('retry and unknown commit lookup remain exact after later live changes',()=>{
  const replay=rpc(box,call(actor,hash,initial.version,firstDesign));assert.equal(replay.outcome,'operation_replayed');assert.deepEqual(replay.result,first.result);
  const recovered=rpc(box,`saas.storefront_design_apply_operation_get(${authority()},'${actor}','${hash}')`);assert.equal(recovered.outcome,'found');assert.deepEqual(recovered.result,first.result);
 });
 scenario('authorized apply preserves archived legacy draft and replays archived resource exactly',()=>{
  owner(box,`UPDATE saas.storefront_design_media SET status='deleted' WHERE id='${MEDIA}'`);
  const before=current();
  const result=rpc(box,call(op(),fingerprint('archived-draft'),before.version,document([manual])));
  assert.equal(result.outcome,'applied');
  assert.deepEqual(current().draft,before.draft);assert.equal(current().draftVersion,before.draftVersion);assert.equal(current().draftUpdatedAt,before.draftUpdatedAt);
  const replay=rpc(box,call(actor,hash,initial.version,firstDesign));assert.equal(replay.outcome,'operation_replayed');assert.deepEqual(replay.result,first.result);
  owner(box,`UPDATE saas.storefront_design_media SET status='active' WHERE id='${MEDIA}'`);
 });
 scenario('revoked membership cannot apply or recover another operation',()=>{
  const before=current();owner(box,`UPDATE saas.memberships SET status='revoked' WHERE id='${MEMBERSHIP}'`);
  const result=rpc(box,call(op(),fingerprint('revoked'),before.version,document([banner])));assert.equal(result.outcome,'membership_denied');assert.deepEqual(current(),before);
  assert.equal(rpc(box,`saas.storefront_design_apply_operation_get(${authority()},'${actor}','${hash}')`).outcome,'membership_denied');
  owner(box,`UPDATE saas.memberships SET status='active' WHERE id='${MEMBERSHIP}'`);
 });
 scenario('migration rollback protects durable direct-apply operations',()=>{
  const failure=psql(box,readFileSync(path.join(c.SQL,'202609300179_storefront_design_direct_apply.down.sql'),'utf8'),DB,true);
  assert.notEqual(failure.status,0);assert.match(failure.stderr,/DESIGN_DIRECT_APPLY_DOWN_HAS_LIVE_OPERATIONS/);
  assert.equal(scalar(box,`SELECT has_function_privilege('celebix_saas_app','saas.storefront_design_editor_payload(uuid)','EXECUTE');`),'f');
 });
}
