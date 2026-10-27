import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {applyBaseline} from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import {startDisposablePostgres} from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';
import {renderContentAuthoringDescription} from '../../../../customer-panel/lib/server-content-authoring/render.ts';

const dir=path.resolve(import.meta.dirname),name='202610270286_toshi_product_formatting';
const pg=startDisposablePostgres({database:'toshi_format286'}),{sql}=pg;
const read=s=>readFileSync(path.join(dir,name+s),'utf8');
const literal=s=>`'${String(s).replaceAll("'","''")}'`,json=v=>`${literal(JSON.stringify(v))}::jsonb`;
const signature='saas.content_authoring_render_nodes(jsonb)';
const catalog=()=>JSON.parse(sql("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'securityDefiner',p.prosecdef,'oid',p.oid))FROM pg_proc p WHERE pronamespace='saas'::regnamespace"));
const word=text=>({type:'text',text}),fact=(factRef,value,unit)=>({type:'fact',factRef,value,...(unit===undefined?{}:{unit})});
const native=blocks=>sql(`SELECT saas.content_authoring_render_description(${json(blocks)})`);
const fixtures=[
 [{type:'paragraph',children:[word('**Literal** <script>'),fact('format:bold:product:title:0','İrmikli ve Yumurtalı Kesme Erişte'),word(' ve '),fact('format:bold:weight:0','250','g'),word(' & "\'')]}],
 [{type:'heading',level:2,children:[word('Kullanım önerileri')]},{type:'paragraph',children:[fact('format:bold:product:title:0','<img src=x onerror="run()">','<svg>')]},{type:'heading',level:3,children:[word('Çorbalarda')]},{type:'list',ordered:false,items:[[fact('format:bold:product:title:0','Erişte')],[word('Metin')]]},{type:'table',rows:[[[word('Sol')],[fact('format:bold:product:title:0','Sağ')]]]}],
];
let checks=0;const check=(name,fn)=>{fn();console.log(`PASS ${++checks} ${name}`);};
try{
 applyBaseline(sql,dir);
 for(const f of readdirSync(dir).filter(f=>/^\d{12}/.test(f)&&Number(f.slice(8,12))>227&&Number(f.slice(8,12))<=285&&/(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(f)).sort((a,b)=>Number(a.slice(8,12))-Number(b.slice(8,12))||a.localeCompare(b)))sql(readFileSync(path.join(dir,f),'utf8'));
 const before=catalog();
 const legacy=[{type:'heading',level:4,children:[word('Eski başlık')]},{type:'paragraph',children:[word('**Kelime**'),fact('product:weight:0','14.89','g'),fact('product:existing:0','**Özgün satıcı metni**')]}];
 const legacyHtml=native(legacy);
 if(!process.argv.includes('--baseline-red')){sql(read('.up.sql'));sql(read('.up.sql'));sql(read('_assertions.sql'));}
 check('known-fact bold aliases have byte-identical native and panel HTML',()=>{for(const blocks of fixtures)assert.equal(native(blocks),renderContentAuthoringDescription(blocks));});
 check('legacy rendering and asterisks remain unchanged',()=>assert.equal(native(legacy),legacyHtml));
 check('unchanged formatted Apply produces the same canonical content and generated digest',()=>{
  for(const blocks of fixtures){const applied=renderContentAuthoringDescription(blocks);assert.equal(sql(`SELECT saas.content_authoring_normalize('description',saas.content_authoring_render_description(${json(blocks)}))=saas.content_authoring_normalize('description',${literal(applied)})`),'t');}
 });
 check('function identity, privileges and every other native routine are unchanged',()=>{
  const after=catalog();for(const key of['owner','acl','config','securityDefiner','oid'])assert.deepEqual(after[signature][key],before[signature][key],key);
  for(const[sig,definition]of Object.entries(before))if(sig!==signature)assert.deepEqual(after[sig],definition,sig);
  for(const role of['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_platform_operator'])assert.throws(()=>sql(`SET ROLE ${role};SELECT saas.content_authoring_render_nodes('[]')`),/permission denied/);
 });
 check('rollback twice restores exact predecessor and keeps audit data untouched',()=>{sql(read('.down.sql'));sql(read('.down.sql'));assert.deepEqual(catalog(),before);});
 check('up after rollback restores matching native output',()=>{sql(read('.up.sql'));sql(read('_assertions.sql'));for(const blocks of fixtures)assert.equal(native(blocks),renderContentAuthoringDescription(blocks));});
 console.log(JSON.stringify({passed:checks,liveDatabaseConnections:0,externalCalls:0,postgresMajor:16}));
}finally{pg.stop();}
