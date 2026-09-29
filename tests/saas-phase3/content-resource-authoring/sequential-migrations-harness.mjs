import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Offline only: creates a fresh PG16 cluster on a private Unix socket.
// No environment DSN or pre-existing database is read.
const ROOT=path.resolve(import.meta.dirname,'../../..');
const SQL=path.join(ROOT,'apps/owner/scripts/sql/saas');
const BIN=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const DB='phase2_sequential_fixture';
const NOW='2026-09-29T12:00:00.000Z';
const STORE='10000000-0000-4000-8000-000000000174';
const PRINCIPAL='20000000-0000-4000-8000-000000000174';
const MEMBERSHIP='30000000-0000-4000-8000-000000000174';
const PLAN='00000000-0000-4000-8000-000000000001';
const HOST='phase2-sequential.example.test';
const id=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const digest=s=>createHash('sha256').update(s).digest('hex');
const lit=v=>v===null?'NULL':`'${String(v).replaceAll("'","''")}'`;
const json=v=>`${lit(JSON.stringify(v))}::jsonb`;
const authority=`'${STORE}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
const migration={
  174:'202609290174_merchant_content_bodies',
  175:'202609290175_content_resource_authoring',
  176:'202609290176_content_research_evidence',
  177:'202609290177_public_merchant_content',
};
let root,socket,data,port,checks=0;
function command(name,args,input='',allowFailure=false){
  const r=spawnSync(path.join(BIN,name),args,{cwd:ROOT,input,encoding:'utf8',timeout:120000,env:{...process.env,LC_ALL:'C',LANG:'C'},maxBuffer:64*1024*1024});
  if(r.error)throw r.error;
  if(!allowFailure&&r.status!==0)throw Error(`${name} exit ${r.status}: ${r.stderr.slice(-3000)}`);
  return r;
}
function sql(source,db=DB,allowFailure=false){return command('psql',['-h',socket,'-p',String(port),'-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'],source,allowFailure);}
const scalar=source=>sql(source).stdout.trim();
const query=source=>JSON.parse(scalar(source));
const owner=source=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_owner;${source};COMMIT;`);
const rpc=(call,role='celebix_saas_app')=>query(`BEGIN;SET LOCAL ROLE ${role};SET LOCAL statement_timeout='5s';SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM ${call};COMMIT;`);
function apply(n,direction){sql(readFileSync(path.join(SQL,`${migration[n]}.${direction}.sql`),'utf8'));}
function check(name,fn){fn();console.log(`PASS ${++checks} ${name}`);}
function snapshot(){
  return query(`SELECT jsonb_build_object(
    'product',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text,'')) FROM saas.products p WHERE id='${id(51)}'),
    'productAudit',(SELECT md5(coalesce(jsonb_agg(to_jsonb(h) ORDER BY id)::text,'')) FROM saas.content_authoring_origin_history h WHERE product_id='${id(51)}'),
    'body',(SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY record_id)::text,'')) FROM saas.merchant_content_bodies b WHERE store_id='${STORE}'),
    'versions',(SELECT md5(coalesce(jsonb_agg(to_jsonb(v) ORDER BY record_id,version)::text,'')) FROM saas.merchant_content_versions v WHERE store_id='${STORE}'),
    'researchOperations',(SELECT md5(coalesce(jsonb_agg(to_jsonb(o) ORDER BY id)::text,'')) FROM saas.content_research_operations o WHERE store_id='${STORE}'),
    'researchSources',(SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY operation_id,ordinal)::text,'')) FROM saas.content_research_sources s WHERE store_id='${STORE}')
  )`);
}
const productFailDefinition=()=>scalar("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname='content_authoring_fail_v2'");
const publicGrant=()=>scalar("SELECT has_function_privilege('celebix_saas_host_resolver','saas.public_blog_get(text,timestamptz,text,text)','EXECUTE') AND has_function_privilege('celebix_saas_host_resolver','saas.public_content_page_get_v2(text,timestamptz,text,text)','EXECUTE') AND NOT has_function_privilege('celebix_saas_app','saas.public_blog_get(text,timestamptz,text,text)','EXECUTE')");
function page(idValue){return rpc(`saas.merchant_content_get(${authority},'page','${idValue}')`);}
function research(idValue){return rpc(`saas.content_research_get(${authority},'${idValue}')`);}
function publicPage(){return rpc(`saas.public_content_page_get_v2('${HOST}','${NOW}'::timestamptz,'integrated-page','tr')`,'celebix_saas_host_resolver');}

async function main(){
  try{
    root=mkdtempSync('/tmp/celebix-phase2-sequential-');socket=path.join(root,'socket');data=path.join(root,'data');port=24000+Math.floor(Math.random()*10000);mkdirSync(socket,{mode:0o700});
    command('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);
    command('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(root,'postgres.log'),'start']);
    sql(`CREATE DATABASE ${DB};`,'postgres');
    const selected=new Set([130,131,142,144,149,150,153,154,158,162,163,164,165,170,171,172,173]);
    const baseline=readdirSync(SQL).filter(f=>{const n=Number(f.slice(8,12));return (n<=128||selected.has(n))&&!f.includes('seed_guzide')&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f);}).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b));
    for(const f of baseline)sql(readFileSync(path.join(SQL,f),'utf8'));
    assert.equal(scalar("SELECT to_regclass('saas.merchant_content_bodies') IS NULL AND to_regclass('saas.content_research_operations') IS NULL"),'t');
    owner(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Sequence fixture','sequence-fixture','active','tr','TRY','starter','2026-01-01','2026-01-01');
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL}','https://identity.example.test','sequence-owner','owner@example.test',true,'2026-01-01','2026-01-01');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('${id(70)}','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
      INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES('${id(71)}','${STORE}','${HOST}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
      INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES('${id(51)}','${STORE}','audit-product','Audit product','draft','TRY','2026-01-01','2026-01-01');
      INSERT INTO saas.content_authoring_origin_history(id,store_id,product_id,draft_id,field,origin,generation_id,source_fingerprint,content_digest,product_version,principal_id,created_at) VALUES('${id(52)}','${STORE}','${id(51)}','${id(53)}','description','manual',NULL,NULL,'sha256:${'a'.repeat(64)}',1,'${PRINCIPAL}','2026-01-01');
      INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES
      ('${id(2)}','${STORE}','language_setting','Language',${json({defaultLocale:'tr',enabledLocales:['tr']})},'active',1,'2026-01-01','2026-01-01'),
      ('${id(3)}','${STORE}','seo_control','SEO',${json({allowIndex:true})},'active',1,'2026-01-01','2026-01-01'),
      ('${id(4)}','${STORE}','sitemap','Sitemap',${json({includeProducts:true,includeContent:true,changeFrequency:'monthly'})},'active',1,'2026-01-01','2026-01-01');`);
    const productBefore=query(`SELECT jsonb_build_object('row',(SELECT to_jsonb(p) FROM saas.products p WHERE id='${id(51)}'),'audit',(SELECT to_jsonb(h) FROM saas.content_authoring_origin_history h WHERE id='${id(52)}'))`);
    const failBefore=productFailDefinition();
    for(const n of [174,175,176,177])check(`migration ${n} up`,()=>apply(n,'up'));
    check('public grants and private-table revocations',()=>{assert.equal(publicGrant(),'t');assert.match(sql('SET ROLE celebix_saas_host_resolver;SELECT body FROM saas.merchant_content_bodies LIMIT 1',DB,true).stderr,/permission denied/);assert.match(sql('SET ROLE celebix_saas_app;SELECT extracted_text FROM saas.content_research_sources LIMIT 1',DB,true).stderr,/permission denied/);});
    const body='<p>'+'ğ'.repeat(39996)+'x</p>';assert.equal(Buffer.byteLength(body),80000);
    const request={draftId:id(90),recordId:null,expectedVersion:null,expectedBodyDigest:null,kind:'page',bodyAction:'replace',values:{name:'Integrated page',slug:'integrated-page',locale:'tr',body,excerpt:null,seoTitle:'Integrated SEO',seoDescription:'Integrated description',published:true,status:'active'},origins:{}};
    const operation=randomUUID();const saved=rpc(`saas.merchant_content_save(${authority},'${operation}','${digest(JSON.stringify(request))}',${json(request)})`);
    check('typed 80000-byte page save and public body exact',()=>{assert.equal(saved.outcome,'saved');assert.equal(saved.payload.body,body);assert.equal(page(saved.payload.id).payload.body,body);assert.equal(publicPage().payload.body,body);assert.equal(publicPage().payload.bodyFormat,'normalized_html');});
    check('legacy locale-less page and blog follow active default locale and refuse duplicate publication',()=>{
      owner(`UPDATE saas.merchant_admin_records SET config=${json({defaultLocale:'en-US',enabledLocales:['en-US']})} WHERE id='${id(2)}';
        INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES
        ('${id(60)}','${STORE}','page','Original page',${json({slug:'legacy-default-page',body:'Original page body',published:true})},'active',1,'2026-01-01','2026-01-01'),
        ('${id(61)}','${STORE}','blog_post','Original blog',${json({slug:'legacy-default-blog',body:'Original blog body',published:true})},'active',1,'2026-01-01','2026-01-01');`);
      for(const [kind,record,slug] of [['page',id(60),'legacy-default-page'],['blog_post',id(61),'legacy-default-blog']]){
        const existing=rpc(`saas.merchant_content_get(${authority},'${kind}','${record}')`);
        assert.equal(existing.payload.locale,'en-US');
        const publicName=kind==='page'?'public_content_page_get_v2':'public_blog_get';
        const publicCall=()=>rpc(`saas.${publicName}('${HOST}','${NOW}'::timestamptz,'${slug}','en-US')`,'celebix_saas_host_resolver');
        assert.equal(publicCall().payload.id,record);
        const duplicate={...request,draftId:randomUUID(),kind,values:{...request.values,name:'Duplicate',slug,locale:'en-US',body:'<p>Duplicate</p>'}};
        const attempt=rpc(`saas.merchant_content_save(${authority},'${randomUUID()}','${digest(JSON.stringify(duplicate))}',${json(duplicate)})`);
        assert.equal(attempt.outcome,'version_conflict');
        assert.equal(publicCall().payload.id,record);
      }
      owner(`UPDATE saas.merchant_admin_records SET config=${json({defaultLocale:'tr',enabledLocales:['tr']})} WHERE id='${id(2)}'`);
    });
    check('absent and ambiguous language settings use shared fallback or fail closed',()=>{
      owner(`UPDATE saas.merchant_admin_records SET status='draft' WHERE id='${id(2)}'`);
      assert.equal(page(id(60)).payload.locale,'tr');
      assert.equal(rpc(`saas.public_content_page_get_v2('${HOST}','${NOW}'::timestamptz,'legacy-default-page','tr')`,'celebix_saas_host_resolver').payload.id,id(60));
      owner(`UPDATE saas.merchant_admin_records SET status='active',config='{}'::jsonb WHERE id='${id(2)}'`);
      const appRead=()=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT * FROM saas.merchant_content_get(${authority},'page','${id(60)}');COMMIT;`,DB,true).status;
      const publicRead=()=>sql(`BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT * FROM saas.public_content_page_get_v2('${HOST}','${NOW}'::timestamptz,'legacy-default-page','tr');COMMIT;`,DB,true).status;
      assert.notEqual(appRead(),0);assert.notEqual(publicRead(),0);
      owner(`UPDATE saas.merchant_admin_records SET config=${json({defaultLocale:'en-US',enabledLocales:['en-US']})} WHERE id='${id(2)}';
        INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES
        ('${id(62)}','${STORE}','language_setting','Ambiguous',${json({defaultLocale:'tr',enabledLocales:['tr']})},'active',1,'2026-01-01','2026-01-01')`);
      assert.notEqual(appRead(),0);assert.notEqual(publicRead(),0);
      owner(`UPDATE saas.merchant_admin_records SET status='draft' WHERE id='${id(62)}';
        UPDATE saas.merchant_admin_records SET config=${json({defaultLocale:'tr',enabledLocales:['tr']})} WHERE id='${id(2)}'`);
    });
    const target={kind:'page',draftId:id(91),recordId:null,recordVersion:null};
    const researchId=randomUUID();const started=rpc(`saas.content_research_begin(${authority},'${researchId}','${'b'.repeat(64)}',${json(target)})`);
    assert.equal(started.outcome,'pending');const claimed=rpc(`saas.content_research_claim(${authority},'${researchId}',${started.payload.version})`);assert.equal(claimed.outcome,'claimed');
    const sourceText='Synthetic private evidence';const source={id:randomUUID(),originalUrl:'https://source.example.test/',finalUrl:'https://source.example.test/',title:'Source',fetchedAt:NOW,contentSha256:digest(sourceText),extractedText:sourceText,byteCount:Buffer.byteLength(sourceText)};
    const usage={sourcesAttempted:1,fetchedBytes:source.byteCount,extractedBytes:source.byteCount,elapsedMs:20};
    const completed=rpc(`saas.content_research_complete(${authority},'${researchId}',${claimed.payload.version},'${claimed.payload.claimToken}',${json([source])},${json(usage)})`);
    check('private research evidence persisted once',()=>{assert.equal(completed.outcome,'completed');assert.equal(research(researchId).payload.sources[0].extractedText,sourceText);assert.equal(scalar(`SELECT count(*) FROM saas.content_research_sources WHERE operation_id='${researchId}'`),'1');});
    const before=snapshot();
    check('product audit and 173 function exact before downgrade',()=>{assert.deepEqual(query(`SELECT jsonb_build_object('row',(SELECT to_jsonb(p) FROM saas.products p WHERE id='${id(51)}'),'audit',(SELECT to_jsonb(h) FROM saas.content_authoring_origin_history h WHERE id='${id(52)}'))`),productBefore);assert.equal(productFailDefinition(),failBefore);});
    for(const n of [177,176,175,174])check(`migration ${n} down`,()=>apply(n,'down'));
    check('downgrade disables writers and preserves all committed rows',()=>{
      assert.deepEqual(snapshot(),before);assert.equal(productFailDefinition(),failBefore);assert.equal(page(saved.payload.id).payload.body,body);assert.equal(research(researchId).payload.sources[0].extractedText,sourceText);
      assert.equal(scalar("SELECT to_regprocedure('saas.public_blog_get(text,timestamptz,text,text)') IS NULL"),'t');
      assert.equal(rpc(`saas.merchant_content_save(${authority},'${randomUUID()}','${digest(JSON.stringify(request))}',${json(request)})`).outcome,'unavailable');
      assert.equal(rpc(`saas.content_research_begin(${authority},'${randomUUID()}','${'b'.repeat(64)}',${json(target)})`).outcome,'unavailable');
    });
    for(const n of [174,175,176,177])check(`migration ${n} re-up`,()=>apply(n,'up'));
    check('re-up restores readers and grants without rewriting evidence',()=>{
      assert.deepEqual(snapshot(),before);assert.equal(productFailDefinition(),failBefore);assert.equal(publicGrant(),'t');
      assert.equal(publicPage().payload.body,body);assert.equal(research(researchId).payload.sources[0].extractedText,sourceText);
      assert.deepEqual(query(`SELECT jsonb_build_object('row',(SELECT to_jsonb(p) FROM saas.products p WHERE id='${id(51)}'),'audit',(SELECT to_jsonb(h) FROM saas.content_authoring_origin_history h WHERE id='${id(52)}'))`),productBefore);
    });
    console.log(`PASS Phase2 sequential PG16: ${checks} checks`);
  } finally {
    if(data&&existsSync(path.join(data,'postmaster.pid')))command('pg_ctl',['-D',data,'-m','fast','stop'],'',true);
    if(root)rmSync(root,{recursive:true,force:true});
  }
}
await main();
