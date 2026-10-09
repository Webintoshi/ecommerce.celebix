import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
const configPath=process.env.CELEBIX_EMAIL_ISOLATED_PG_CONFIG;
test('native email schema isolates credentials, commands, account binding and replay', {skip:!configPath}, async()=>{
 const config=JSON.parse(await readFile(configPath!,'utf8'));
 assert.equal(config.database,'email_marketing_isolated');assert.match(config.host,/^\/tmp\/celebix-email-marketing-/);assert.equal(config.port,31849);
 const pool=new Pool({...config,max:1});
 try {
  const server=await pool.query("SELECT current_setting('server_version_num')::int AS version,current_setting('listen_addresses') AS listen");assert.equal(server.rows[0].listen,'');assert.ok(server.rows[0].version>=160000&&server.rows[0].version<170000);
  const schema=await pool.query("SELECT to_regclass('saas.email_marketing_connections') AS relation");
  assert.ok(schema.rows[0].relation,'email marketing tables are missing');
  const assertions=await readFile(new URL('./email-marketing-connections_assertions.sql',import.meta.url),'utf8');await pool.query(assertions);
  await pool.query(assertions.replace(/\nROLLBACK;\s*$/,'\n'));
  const down=await readFile(new URL('./email-marketing-connections.down.sql',import.meta.url),'utf8');
  await assert.rejects(()=>pool.query(down),(e:unknown)=>e instanceof Error&&e.message==='EMAIL_MARKETING_ROLLBACK_RETAINED_EVIDENCE');
  await pool.query('ROLLBACK');
 }finally{await pool.end();}
});
