import { Window } from 'happy-dom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { renderContentAuthoringDescription } from '../../../apps/customer-panel/lib/server-content-authoring/render.ts';
import { normalizeStoredProductDescription } from '../../../apps/customer-panel/lib/product-description-editor.ts';
import { createHash } from 'node:crypto';
import pg from 'pg';
// Reuses the established retail fixture seed against a disposable PostgreSQL16 cluster.
import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const ROOT = path.resolve(import.meta.dirname, "../../.."), SQL = path.join(ROOT, "apps/owner/scripts/sql/saas"), DB = "starter_retail_experience", RESTORE = "starter_retail_restore";
const UP = "202608020075_complete_starter_retail_experience.up.sql", DOWN = "202608020075_complete_starter_retail_experience.down.sql", ASSERTIONS = "202608020075_complete_starter_retail_experience_assertions.sql";
const STORE_A = "10000000-0000-4000-8000-000000000075", STORE_B = "10000000-0000-4000-8000-000000000076", HOST_A = "retail-a.example.test", HOST_PLATFORM = "retail-a.saas-staging.celebix.site", HOST_B = "retail-b.example.test", PLAN = "00000000-0000-4000-8000-000000000001";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000075", PRINCIPAL_B = "20000000-0000-4000-8000-000000000076", MEMBERSHIP_A = "30000000-0000-4000-8000-000000000075", MEMBERSHIP_B = "30000000-0000-4000-8000-000000000076";
const PRODUCT = "40000000-0000-4000-8000-000000000075", INACTIVE_PRODUCT = "40000000-0000-4000-8000-000000000076", VARIANT = "50000000-0000-4000-8000-000000000075", COMPOSITION = "60000000-0000-4000-8000-000000000075", NOW = "2026-08-02T09:00:00.000Z";
function executable(name) {
    const candidates = [process.env.POSTGRES_BIN, ...(process.env.PATH ?? "").split(path.delimiter)];
    try {
        for (const entry of readdirSync(path.join(homedir(), ".codex", "tmp"), {
            withFileTypes: true
        }))
            if (entry.isDirectory() && /^postgresql-16[.]/.test(entry.name))
                candidates.push(path.join(homedir(), ".codex", "tmp", entry.name, "bin"));
    }
    catch {
    }
    for (const directory of candidates) {
        if (!directory)
            continue;
        const candidate = path.join(directory, name);
        try {
            accessSync(candidate, constants.X_OK);
            return candidate;
        }
        catch {
        }
    }
    throw new Error(`DISPOSABLE_DB_EXECUTION_BLOCKED: missing ${name}`);
}
function command(program, args, input = "", allowFailure = false, environment = {}) {
    const result = spawnSync(program, args, {
        cwd: ROOT, input, encoding: "utf8", env: {
            ...process.env, ...environment, LC_ALL: "C", LANG: "C"
        }, maxBuffer: 128 * 1024 * 1024
    });
    if (result.error)
        throw result.error;
    if (!allowFailure && result.status !== 0)
        throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
    return result;
}
function start() {
    const tools = Object.fromEntries(["initdb", "pg_ctl", "psql"].map(name => [name, executable(name)]));
    const root = mkdtempSync(path.join("/tmp", "celebix-content-operations-")), data = path.join(root, "data"), socket = path.join(root, "socket"), port = 20000 + Math.floor(Math.random() * 15000);
    mkdirSync(socket, {
        mode: 0o700
    });
    command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
    command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
    return {
        tools, root, data, socket, port
    };
}
function stop(box) {
    if (!box)
        return;
    command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
    rmSync(box.root, {
        recursive: true, force: true
    });
}
function psql(box, source, database = DB, allowFailure = false) {
    return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure);
}
function apply(box, file, database = DB) {
    psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}
function migrations() {
    const accepted = /(?:[.]up|[.]seed|[.]freeze|_grants|_assertions|catalog_assertions)[.]sql$/;
    return readdirSync(SQL).filter(file => {
        const sequence = Number.parseInt(file.slice(8, 12), 10);
        return Number.isSafeInteger(sequence) && sequence <= 71 && accepted.test(file) && !file.includes(".down.");
    }).sort((left, right) => {
        const a = Number.parseInt(left.slice(8, 12), 10), b = Number.parseInt(right.slice(8, 12), 10);
        if (a !== b)
            return a - b;
        const weight = value => value.includes("assertions") ? 3 : value.includes("freeze") || value.includes("grants") ? 2 : 1;
        return weight(left) - weight(right) || left.localeCompare(right);
    });
}
function result(box, call, database = DB) {
    const output = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT outcome||'|'||COALESCE(result_payload::text,'null') FROM ${call};COMMIT;`, database).stdout.trim().split("\n").at(-1), separator = output.indexOf("|");
    return {
        outcome: output.slice(0, separator), payload: JSON.parse(output.slice(separator + 1))
    };
}
async function main() {
 let box;
 try {
  box = start();
  psql(box, `CREATE DATABASE ${DB};`, 'postgres');
  const files = readdirSync(SQL).filter(f => {
   const n = Number.parseInt(f.slice(8,12),10);
   return (n <= 80 || [114,149,150,162,163,164,170].includes(n)) && !f.includes('seed_guzide') && /(?:[.]up|[.]seed|[.]freeze|_grants)[.]sql$/.test(f);
  }).sort((a,b)=> Number.parseInt(a.slice(8,12),10)-Number.parseInt(b.slice(8,12),10)||a.localeCompare(b));
  for(const f of files) apply(box,f);
        psql(box, `SET ROLE celebix_saas_owner;
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE_A}','AI A','ai-a','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${STORE_B}','AI B','ai-b','active','tr','TRY','starter','2026-01-01','2026-01-01');
 INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL_A}','https://identity.example.test/oidc','ai-a','ai-a@example.test',true,'2026-01-01','2026-01-01'),('${PRINCIPAL_B}','https://identity.example.test/oidc','ai-b','ai-b@example.test',true,'2026-01-01','2026-01-01');
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('71000000-0000-4000-8000-000000000075','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),('71000000-0000-4000-8000-000000000076','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');`);

  const signature='saas.catalog_update_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text,jsonb)';
  assert.equal(psql(box,`SELECT to_regprocedure('${signature}') IS NULL;`).stdout.trim(),'t');
  console.log('RED origin save RPC absent before SQL172');
  apply(box,'202609290172_content_authoring_origins.up.sql');
  apply(box,'202609290172_content_authoring_origins.down.sql');
  apply(box,'202609290172_content_authoring_origins.up.sql');
  const now='2026-09-29T12:00:00.000Z', fp='a'.repeat(64), source='b'.repeat(64), config='80000000-0000-4000-8000-000000000075';
  const uuid=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const quote=v=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`;
  const json=v=>quote(JSON.stringify(v))+'::jsonb';
  const auth=(actor=PRINCIPAL_A,member=MEMBERSHIP_A,store=STORE_A)=>`${quote(store)},${quote(actor)},${quote(member)},${quote(PLAN)},'free_starter',1,100,${quote(now)}`;
  const run=call=>{
   const row=psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome||'|'||coalesce(result_payload::text,'null') FROM saas.${call};COMMIT;`).stdout.trim().split('\n').at(-1);
   const i=row.indexOf('|'); return {outcome:row.slice(0,i),payload:JSON.parse(row.slice(i+1))};
  };
  let operation=1000;
  const identity=(id=++operation)=>`${quote(uuid(id))},${quote(fp)}`;
  const resources={collections:[],tags:[],attributes:[],extras:[],definitions:[]};
  const quick=(product,title,id=++operation)=>`catalog_onboard_product_with_origins(${auth()},${identity(id)},${quote(product)},ARRAY[${quote(uuid(id+10000))}]::uuid[],${json({kind:'quick',title,priceCents:100,publish:false})})`;
  const invalidQuick=quick(uuid(200),'Invalid Quick').replace(/\}('::jsonb\))$/,',"contentOrigins":{}}$1');
  assert.equal(run(invalidQuick).outcome,'invalid_input','quick create cannot accept an advanced origin envelope');
  assert.equal(run(quick(PRODUCT,'Origin Product')).outcome,'created');
  const SECOND=uuid(20); assert.equal(run(quick(SECOND,'Second Product')).outcome,'created');
  const sealed={algorithm:'A256GCM',ciphertext:'Y3JlZGVudGlhbA',iv:'MTIzNDU2Nzg5MDEy',keyId:'qa',tag:'MTIzNDU2Nzg5MDEyMzQ1Ng',version:1};
  const providerAuth=auth().replace(',100,',',');
  assert.equal(run(`toshi_provider_connect(${providerAuth},${identity()},${quote(config)},'deepseek',${json(sealed)},'sha256:${fp}',1,'••••QA01','deepseek-flash','[{"id":"deepseek-flash","label":"Flash"}]'::jsonb,0)`).outcome,'connected');
  const EDITOR=uuid(30),MEMBER=uuid(31);
  psql(box,`SET ROLE celebix_saas_owner;
   INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${EDITOR}','https://identity.example.test/oidc','editor','editor@example.test',true,'2026-01-01','2026-01-01');
   INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBER}','${EDITOR}','${STORE_A}','editor','active','2026-01-01','2026-01-01');`);
  const description=[{type:'paragraph',children:[{type:'text',text:'Pure "linen" & cotton'}]},{type:'heading',level:4,children:[{type:'text',text:'Details'}]},{type:'list',ordered:false,items:[[{type:'fact',factRef:'weight',value:'14,89',unit:'g'}]]},{type:'table',rows:[[[{type:'text',text:'One'}],[{type:'text',text:"Two's"}]]]}];
  const expectedHtml='<p>Pure &quot;linen&quot; &amp; cotton</p><h4>Details</h4><ul><li>14,89 g</li></ul><table><tbody><tr><td>One</td><td>Two&#39;s</td></tr></tbody></table>';
  const generatedHtml=renderContentAuthoringDescription(description);
  assert.equal(generatedHtml,expectedHtml);
  const browser=new Window();const globals=new Map();
  for(const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,Node:browser.Node,getComputedStyle:browser.getComputedStyle.bind(browser)})) {globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value});}
  let editorHtml;
  const editor=new Editor({element:browser.document.createElement('div'),extensions:[StarterKit.configure({heading:{levels:[2,3,4]}}),TableKit],content:generatedHtml});
  try { editorHtml=normalizeStoredProductDescription(editor.getHTML());assert.match(editorHtml,/<li><p>14,89 g<\/p><\/li>/);assert.match(editorHtml,/<h4>Details<\/h4>/); }
  finally {editor.destroy();for(const [key,value] of globals)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);await browser.happyDOM.close();}

  const seedGeneration=(id,product=PRODUCT,actor=PRINCIPAL_A,store=STORE_A,fields={description,seoTitle:'Generated title',seoDescription:'Generated description'},status='completed')=>{
   const draft={...fields,suggestions:[],claims:[],sourceFingerprint:source};
   psql(box,`SET ROLE celebix_saas_owner;INSERT INTO saas.content_authoring_operations(id,store_id,principal_id,draft_id,product_id,request_fingerprint,source_fingerprint,config_id,provider,model,credential_version,prompt_version,status,draft,created_at,updated_at,finished_at)
    VALUES(${quote(uuid(id))},${quote(store)},${quote(actor)},${quote(uuid(id+100))},${quote(product)},'${fp}','${source}','${config}','deepseek','deepseek-flash',1,'v1',${quote(status)},${status==='completed'?json(draft):'NULL'},'${now}','${now}',${status==='pending'?'NULL':quote(now)});`);
   return {generationId:uuid(id),draftId:uuid(id+100)};
  };
  const emptyBlocks=[{type:'paragraph',children:[]},{type:'heading',level:2,children:[{type:'text',text:' '}]},{type:'paragraph',children:[{type:'text',text:'Visible'}]}];
  const emptyHtml=renderContentAuthoringDescription(emptyBlocks);
  assert.equal(psql(box,`SELECT saas.content_authoring_normalize('description',${quote(emptyHtml)});`).stdout.trim(),normalizeStoredProductDescription(emptyHtml),'generated empty blocks normalize like stored HTML');
  const origin=seedGeneration(40);
  const callUpdate=(version,origins={},text=editorHtml,product=PRODUCT,a=auth(),id=++operation)=>`catalog_update_product_with_origins(${a},${identity(id)},${quote(product)},${version},${quote(product===PRODUCT?'origin-product':'second-product')},'Origin Product',${quote(text)},'draft','TRY',${json(origins)})`;
  const history=product=>JSON.parse(psql(box,`SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY field,product_version),'[]') FROM saas.content_authoring_origin_history h WHERE product_id=${quote(product)};`).stdout.trim());
  const initialCount=history(PRODUCT).length;
  const rejected=callUpdate(1,{description:{...origin,draftId:uuid(999)}});
  assert.equal(run(rejected).outcome,'invalid_input');
  assert.equal(history(PRODUCT).length,initialCount);
  assert.equal(psql(box,`SELECT version FROM saas.products WHERE id='${PRODUCT}';`).stdout.trim(),'1');
  assert.equal(psql(box,`SELECT count(*) FROM saas.catalog_operations WHERE operation_id='${uuid(operation)}';`).stdout.trim(),'0');
  const okCall=callUpdate(1,{description:origin});assert.equal(run(okCall).outcome,'updated');
  let h=history(PRODUCT).filter(x=>x.field==='description').at(-1);
  assert.equal(h.origin,'ai');assert.equal(h.content_digest,h.generated_content_digest);
  assert.equal(h.content_digest,'sha256:'+createHash('sha256').update(generatedHtml.replaceAll('&quot;','"').replaceAll('&#39;',"'")).digest('hex'));
  assert.equal(run(okCall).outcome,'operation_replayed');assert.equal(history(PRODUCT).length,initialCount+1);
  assert.equal(run(callUpdate(1,{description:origin})).outcome,'version_conflict');assert.equal(history(PRODUCT).length,initialCount+1);
  assert.equal(history(PRODUCT).filter(x=>x.field==='seoTitle').at(-1).origin,'manual','description save must not mark SEO saved');
  const updateSEO=(version,origins={},title='Generated title',a=auth())=>`catalog_update_merchandising_with_origins(${a},${identity()},'${PRODUCT}',${version},${json({profile:{minimumPurchaseQuantity:1,seoTitle:title,seoDescription:'Generated description'},categoryIds:[],resourceIds:resources,channelIds:[]})},${json(origins)})`;
  assert.equal(run(updateSEO(1,{seoTitle:origin,seoDescription:origin})).outcome,'updated');
  assert.equal(history(PRODUCT).filter(x=>x.field==='description').length,2);
  assert.equal(run(updateSEO(1,{seoTitle:origin})).outcome,'version_conflict');
  const before=history(PRODUCT).length;
  assert.equal(run(updateSEO(2,{seoTitle:origin,seoDescription:{...origin,draftId:uuid(999)}})).outcome,'invalid_input');
  assert.equal(history(PRODUCT).length,before,'a failed second field rolls back the first field association');
  assert.equal(psql(box,`SELECT version FROM saas.catalog_product_profiles WHERE product_id='${PRODUCT}';`).stdout.trim(),'2');
  assert.equal(run(updateSEO(2,{description:origin})).outcome,'invalid_input');assert.equal(history(PRODUCT).length,before);
  assert.equal(run(callUpdate(2,{description:origin},'<p>Edited</p>',PRODUCT,auth(EDITOR,MEMBER))).outcome,'updated');
  h=history(PRODUCT).filter(x=>x.field==='description').at(-1);assert.equal(h.origin,'edited_ai');assert.equal(h.principal_id,EDITOR);assert.equal(h.generation_id,origin.generationId);assert.notEqual(h.content_digest,h.generated_content_digest);
  // Omitting references on legacy saves retains exact latest lineage for an authorized editor.
  assert.equal(run(callUpdate(3,{},'<p>More editing</p>',PRODUCT,auth(EDITOR,MEMBER))).outcome,'updated');
  assert.equal(history(PRODUCT).filter(x=>x.field==='description').at(-1).generation_id,origin.generationId);
  const read=()=>run(`catalog_get_product_editor_with_origins(${auth(EDITOR,MEMBER)},'${PRODUCT}')`);
  assert.deepEqual(read().payload.contentOrigins,{description:origin,seoTitle:origin,seoDescription:origin});
  assert.doesNotMatch(JSON.stringify(read().payload.contentOrigins),/fingerprint|digest|principal|provider|model/i);
  assert.equal(run(callUpdate(4,{description:null},'<p>Manual restored</p>',PRODUCT,auth(EDITOR,MEMBER))).outcome,'updated');
  assert.equal(read().payload.contentOrigins.description,null);
  assert.equal(history(PRODUCT).filter(x=>x.field==='description').at(-1).origin,'manual');
  assert.equal(run(callUpdate(5,{description:origin},editorHtml,PRODUCT,auth(EDITOR,MEMBER))).outcome,'invalid_input','superseded cross-actor lineage denied');
  const foreign=seedGeneration(41,PRODUCT,EDITOR);
  const wrongProduct=seedGeneration(42,SECOND);
  const wrongStore=seedGeneration(43,null,PRINCIPAL_B,STORE_B);
  const pending=seedGeneration(44,PRODUCT,PRINCIPAL_A,STORE_A,{},'pending');
  const seoOnly=seedGeneration(45,PRODUCT,PRINCIPAL_A,STORE_A,{seoTitle:'Only SEO'});
  const unbound=seedGeneration(46,null);
  for(const ref of [foreign,wrongProduct,wrongStore,pending,seoOnly,unbound,{generationId:uuid(9999),draftId:uuid(9998)}])assert.equal(run(callUpdate(5,{description:ref})).outcome,'invalid_input');
  assert.equal(run(callUpdate(1,{description:origin},editorHtml,SECOND,auth(EDITOR,MEMBER))).outcome,'invalid_input','other product lineage denied');
  assert.equal(run(updateSEO(2,{seoTitle:foreign},'Foreign SEO')).outcome,'invalid_input','fresh foreign generation denied');
  // The committed description reference does not grant another editor access to an uncommitted SEO field.
  const partial=seedGeneration(47);assert.equal(run(callUpdate(5,{description:partial})).outcome,'updated');
  assert.equal(run(updateSEO(2,{seoTitle:partial},'Generated title',auth(EDITOR,MEMBER))).outcome,'invalid_input');
  psql(box,`SET ROLE celebix_saas_owner;UPDATE saas.memberships SET status='revoked' WHERE id='${MEMBER}';`);
  assert.equal(run(callUpdate(6,{},'denied',PRODUCT,auth(EDITOR,MEMBER))).outcome,'membership_denied');
  assert.equal(read().outcome,'membership_denied');
  psql(box,`SET ROLE celebix_saas_owner;UPDATE saas.memberships SET status='active' WHERE id='${MEMBER}';`);
  const newOrigin=seedGeneration(48,null),NEW_A=uuid(60),NEW_B=uuid(61);
  const advanced=(product,opid)=>`catalog_onboard_product_with_origins(${auth()},${identity(opid)},'${product}',ARRAY['${uuid(opid+10000)}']::uuid[],${json({kind:'advanced',productType:'physical',title:'Created '+product.slice(-2),description:editorHtml,publish:false,variants:[{title:'Default',priceCents:100,stockTracking:true,stockQuantity:0,attributes:{},continueSellingWhenOutOfStock:false,inventory:[]}],profile:{minimumPurchaseQuantity:1,seoTitle:'Generated title'},categoryIds:[],resourceIds:resources,channelIds:[],contentOrigins:{description:newOrigin,seoTitle:newOrigin}})})`;
  const connection=()=>new pg.Client({host:box.socket,port:box.port,user:'postgres',database:DB});
  const race=async call=>{const c=connection();await c.connect();try{await c.query('BEGIN;SET LOCAL ROLE celebix_saas_app');const r=await c.query('SELECT * FROM saas.'+call);await c.query('COMMIT');return r.rows[0];}finally{await c.end();}};
  const results=await Promise.all([race(advanced(NEW_A,2000)),race(advanced(NEW_B,2001))]);
  assert.deepEqual(results.map(r=>r.outcome).sort(),['created','invalid_input']);
  const winner=results[0].outcome==='created'?NEW_A:NEW_B,loser=winner===NEW_A?NEW_B:NEW_A;
  assert.equal(history(winner).filter(x=>x.generation_id===newOrigin.generationId).length,2);assert.equal(history(loser).length,0);
  assert.equal(psql(box,`SELECT count(*) FROM saas.products WHERE id='${loser}';`).stdout.trim(),'0');
  for(const role of ['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver']){
   assert.notEqual(psql(box,`SET ROLE ${role};SELECT * FROM saas.content_authoring_origin_history;`,DB,true).status,0);
   assert.equal(psql(box,`SELECT has_function_privilege('${role}','saas.content_authoring_append_origins(uuid,uuid,uuid,text[],jsonb,timestamptz,boolean)','EXECUTE');`).stdout.trim(),'f');
  }
  assert.equal(psql(box,`SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='saas.content_authoring_origin_history'::regclass;`).stdout.trim(),'t');
  assert.notEqual(psql(box,`SET ROLE celebix_saas_owner;UPDATE saas.content_authoring_origin_history SET origin='manual';`,DB,true).status,0);
  const durable=history(PRODUCT);apply(box,'202609290172_content_authoring_origins.down.sql');assert.deepEqual(history(PRODUCT),durable);
  apply(box,'202609290172_content_authoring_origins.up.sql');assert.deepEqual(history(PRODUCT),durable);assert.equal(read().payload.contentOrigins.description.generationId,partial.generationId);
  console.log('PASS PostgreSQL16 atomic rollback, replay/CAS, per-field versions, server digests, current authority, cross-actor latest lineage/manual restore, strict generation binding, concurrent create binding, private reload, RLS, down/up preservation');
 } finally { stop(box); }
}
await main();
