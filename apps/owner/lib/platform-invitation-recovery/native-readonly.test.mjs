import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';

const bin=path.join(homedir(),'.codex/tmp/postgresql-16.14-install/bin');
test('actual original native invitation replay in READ ONLY cannot create a new invite or grant',{skip:!existsSync(path.join(bin,'initdb')),timeout:45000},async()=>{
 const temp=mkdtempSync('/tmp/owner-invitation-recovery-'),data=path.join(temp,'data'),sock=path.join(temp,'sock');mkdirSync(sock);const port=25000+Math.floor(Math.random()*10000);
 const run=(name,args,input='')=>{const r=spawnSync(path.join(bin,name),args,{input,encoding:'utf8',timeout:15000,maxBuffer:200000});assert.equal(r.status,0,`${name} failed (private fixture output suppressed)`);return r.stdout.trim();};
 const args=['-h',sock,'-p',String(port),'-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'];const sql=text=>run('psql',args,text);let started=false;
 try {
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale']);run('pg_ctl',['-D',data,'-l',path.join(temp,'postgres.log'),'-o',`-k ${sock} -p ${port} -h 127.0.0.1`,'-w','start']);started=true;
  const directory=new URL('../../scripts/sql/saas/',import.meta.url);const source=readFileSync(new URL('202610040212_platform_invitations.up.sql',directory),'utf8');const original=readFileSync(new URL('202610040209_platform_control_plane.up.sql',directory),'utf8');
  const create=source.slice(source.indexOf('CREATE FUNCTION saas.platform_invitation_create'),source.indexOf('CREATE FUNCTION saas.platform_invitation_start')).trim();const active=original.slice(original.indexOf('CREATE FUNCTION saas.platform_operator_require_active'),original.indexOf('CREATE FUNCTION saas.platform_operator_resolve')).trim();
  assert.match(create,/READ|platform_command_results/);assert.match(create,/RETURN jsonb_set\(prior.result/);
  sql(`CREATE SCHEMA saas;CREATE ROLE celebix_saas_owner NOLOGIN;CREATE ROLE celebix_saas_bootstrap NOLOGIN;CREATE ROLE celebix_saas_app NOLOGIN;CREATE ROLE celebix_saas_identity NOLOGIN;CREATE ROLE celebix_saas_workflow NOLOGIN;CREATE ROLE celebix_saas_migrator NOLOGIN;CREATE ROLE celebix_saas_platform_operator NOLOGIN NOINHERIT;CREATE ROLE fixture_owner_runtime LOGIN NOINHERIT;GRANT celebix_saas_platform_operator TO fixture_owner_runtime;GRANT USAGE ON SCHEMA saas TO celebix_saas_platform_operator;
CREATE TABLE saas.principals(id uuid PRIMARY KEY,issuer text,subject text,email text,email_verified boolean);
CREATE TABLE saas.stores(id uuid PRIMARY KEY,status text);
CREATE TABLE saas.platform_operators(id uuid PRIMARY KEY,principal_id uuid REFERENCES saas.principals,issuer text,subject text,email text,active boolean);
CREATE TABLE saas.platform_store_versions(store_id uuid PRIMARY KEY,version bigint DEFAULT 0);
CREATE TABLE saas.platform_audit(operator_id uuid,store_id uuid,action text,payload jsonb);
CREATE TABLE saas.platform_command_results(operator_id uuid,idempotency_key text,request jsonb,result jsonb,created_at timestamptz DEFAULT now(),PRIMARY KEY(operator_id,idempotency_key));
CREATE TABLE saas.admin_domains(store_id uuid,hostname text,status text,canonical boolean,verified_at timestamptz,created_at timestamptz);
CREATE TABLE saas.memberships(principal_id uuid,store_id uuid,role text,status text);
${source.slice(source.indexOf('CREATE TABLE saas.platform_member_invitations('),source.indexOf('CREATE TABLE saas.platform_invitation_oidc_attempts('))}
${active}\n${create}
REVOKE ALL ON ALL TABLES IN SCHEMA saas FROM PUBLIC,celebix_saas_platform_operator;
REVOKE ALL ON FUNCTION saas.platform_operator_require_active(uuid),saas.platform_invitation_create(uuid,jsonb,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.platform_operator_require_active(uuid),saas.platform_invitation_create(uuid,jsonb,bigint,text,text) TO celebix_saas_platform_operator;`);
  const OP='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002',TARGET='10000000-0000-4000-8000-000000000003',STORE='10000000-0000-4000-8000-000000000004',ISSUER='https://identity.example.test/oidc',KEY='10000000-0000-4000-8000-000000000005';
  sql(`INSERT INTO saas.principals VALUES('${OP}','https://owner.example.test','one','one@example.test',true),('${OTHER}','https://owner.example.test','two','two@example.test',true),('${TARGET}','${ISSUER}','target','target@example.test',true);INSERT INTO saas.platform_operators VALUES('${OP}','${OP}','https://owner.example.test','one','one@example.test',true),('${OTHER}','${OTHER}','https://owner.example.test','two','two@example.test',true);INSERT INTO saas.stores VALUES('${STORE}','active');INSERT INTO saas.admin_domains VALUES('${STORE}','qa.admin.example.test','active',true,now(),now());`);
  const payload={storeId:STORE,targetEmail:'target@example.test',targetPrincipalId:TARGET,role:'admin',kind:'invite'};const quoted=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
  const issued=JSON.parse(sql(`SET ROLE celebix_saas_platform_operator;SELECT saas.platform_invitation_create('${OP}',${quoted(payload)},0,'${KEY}','${ISSUER}');`));assert.equal(issued.outcome,'committed');
  const snapshot=()=>sql("SELECT jsonb_build_object('invites',(SELECT count(*) FROM saas.platform_member_invitations),'commands',(SELECT count(*) FROM saas.platform_command_results),'audit',(SELECT count(*) FROM saas.platform_audit),'memberships',(SELECT count(*) FROM saas.memberships),'versions',(SELECT jsonb_agg(version) FROM saas.platform_store_versions));");const before=snapshot();assert.deepEqual(JSON.parse(before),{invites:1,commands:1,audit:1,memberships:0,versions:[1]});
  process.env.CELEBIX_PLATFORM_DATABASE_URL=`postgresql://fixture_owner_runtime@127.0.0.1:${port}/postgres`;process.env.CELEBIX_SAAS_DATABASE_NAME='postgres';delete process.env.CELEBIX_STAGING_DB_CA_B64;
  const {platformTransaction}=await import('../platform/database.ts');
  const replay=async(actor=OP,key=KEY,version=0,body=payload,issuer=ISSUER)=>platformTransaction(false,async client=>{const mode=await client.query('SHOW transaction_read_only');assert.equal(mode.rows[0].transaction_read_only,'on');return(await client.query('SELECT saas.platform_invitation_create($1::uuid,$2::jsonb,$3::bigint,$4::text,$5::text) AS value',[actor,JSON.stringify(body),version,key,issuer])).rows[0].value;});
  const result=await replay();assert.equal(result.outcome,'replayed');assert.ok(result.result.acceptanceToken===issued.result.acceptanceToken);assert.equal(result.result.invitationId,issued.result.invitationId);assert.equal(snapshot(),before);
  for(const [attempt,code] of [[()=>replay(OP,'unknown-key-0',0),'25006'],[()=>replay(OP,'unknown-key-1',1),'25006'],[()=>replay(OTHER),'25006'],[()=>replay(OP,KEY,1),'P0001'],[()=>replay(OP,KEY,0,{...payload,role:'editor'}),'P0001'],[()=>replay(OP,KEY,0,payload,'https://different.example.test'),'P0001']]){await assert.rejects(attempt,error=>error.code===code);assert.equal(snapshot(),before);}
  sql(`UPDATE saas.platform_operators SET active=false WHERE id='${OP}';`);await assert.rejects(()=>replay(),error=>error.code==='42501');assert.equal(snapshot(),before);
 }finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);rmSync(temp,{recursive:true,force:true});}
});
