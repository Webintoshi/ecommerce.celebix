// Disposable PostgreSQL 16 only: never accepts a database URL or network hostname.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir,homedir } from 'node:os';
const root=path.resolve(import.meta.dirname,'../../..'), sql=path.join(root,'apps/owner/scripts/sql/saas');
const bin=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
const box=mkdtempSync(path.join(tmpdir(),'celebix-variant-galleries-')), data=path.join(box,'data'), socket=path.join(box,'socket');
const port=23000+Math.floor(Math.random()*10000);
function run(name,args,input=''){const r=spawnSync(path.join(bin,name),args,{input,encoding:'utf8',maxBuffer:64*1024*1024});if(r.error||r.status!==0)throw new Error(`${name}: ${r.error??r.stderr}`);return r.stdout;}
function query(input){return run('psql',['-h',socket,'-p',String(port),'-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],input);}
let started=false;
try{
 mkdirSync(socket);run('initdb',['-D',data,'--auth=trust','--username=postgres','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',data,'-o',`-k ${socket} -p ${port} -h ''`,'-l',path.join(box,'server.log'),'start']);started=true;
 // Store-specific seed73 is excluded;148 retains schema while omitting its live Siora backfill.
 //161/184 rely on frozen live predecessor functions absent or drifted in the source chain;
 //186 does not alter those POS routines, and185 thumbnail authority is applied verbatim.
 const accepted=/(?:[.]up|[.]seed|[.]freeze|_grants)[.]sql$/;
 const files=readdirSync(sql).filter(file=>/^2026/.test(file)&&Number(file.slice(8,12))<=185&&accepted.test(file)&&!file.includes("seed_guzide_pilot")&&!file.includes("202609260161_")&&!file.includes("202609300184_")).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||(a.includes('freeze')?1:0)-(b.includes('freeze')?1:0)||a.localeCompare(b));
 for(const file of files){try{query(readFileSync(path.join(sql,file),'utf8').replace(/DO \$backfill\$[\s\S]*?\$backfill\$;/,file.includes('202609230148_')?'':'$&'));}catch(error){throw new Error(`${file}: ${error.message}`);}}
 assert.equal(query("SELECT to_regprocedure('saas.media_save_variant_gallery(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb)') IS NULL;").trim(),'t');
 if(process.argv.includes('--red'))query("SELECT * FROM saas.media_list_variant_gallery(NULL::uuid,NULL::uuid,NULL::uuid,NULL::uuid,NULL::text,NULL::bigint,NULL::bigint,NULL::timestamptz,NULL::uuid);");
 query(readFileSync(path.join(sql,'202610010186_variant_image_galleries.up.sql'),'utf8'));
 query('BEGIN;\n'+readFileSync(path.join(import.meta.dirname,'fixture.sql'),'utf8')+readFileSync(path.join(import.meta.dirname,'behavior.sql'),'utf8')+'\nROLLBACK;');
 query(readFileSync(path.join(sql,'202610010186_variant_image_galleries.down.sql'),'utf8'));
 assert.equal(query("SELECT to_regclass('saas.variant_media_links') IS NULL;").trim(),'t');
 query(readFileSync(path.join(sql,'202610010186_variant_image_galleries.up.sql'),'utf8'));
 query('BEGIN;\n'+readFileSync(path.join(import.meta.dirname,'fixture.sql'),'utf8')+readFileSync(path.join(import.meta.dirname,'behavior.sql'),'utf8')+'\nROLLBACK;');
 query(readFileSync(path.join(sql,'202610010186_variant_image_galleries.down.sql'),'utf8'));
 query('BEGIN;\n'+readFileSync(path.join(import.meta.dirname,'fixture.sql'),'utf8')+'\nCOMMIT;');
 const beforeLegacy=query("SELECT jsonb_agg(jsonb_build_object('id',id,'variantId',variant_id,'objectKey',object_key,'byteSize',byte_size,'version',version) ORDER BY id) FROM saas.product_media;").trim();
 query(readFileSync(path.join(sql,'202610010186_variant_image_galleries.up.sql'),'utf8'));
 assert.equal(query("SELECT saas.variant_gallery_projection('10000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186')#>>'{gallery,assignments,0,mediaIds,0}';").trim(),'60000000-0000-4000-8000-000000000016');
 assert.equal(query("SELECT jsonb_agg(jsonb_build_object('id',id,'variantId',variant_id,'objectKey',object_key,'byteSize',byte_size,'version',version) ORDER BY id) FROM saas.product_media;").trim(),beforeLegacy);
 console.log('PASS isolated PostgreSQL16 galleries behavior, rollback fixture, down/up, legacy backfill');
}finally{if(started)run('pg_ctl',['-D',data,'-m','fast','stop']);rmSync(box,{recursive:true,force:true});}
