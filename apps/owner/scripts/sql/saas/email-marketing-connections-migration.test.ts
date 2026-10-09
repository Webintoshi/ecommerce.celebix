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
  const assertions=await readFile(new URL('./email-marketing-connections_assertions.sql',import.meta.url),'utf8');await pool.query(assertions);await pool.query(await readFile(new URL('./email-marketing-workflow_assertions.sql',import.meta.url),'utf8'));
  await pool.query(assertions.replace(/\nROLLBACK;\s*$/,'\n'));
  const down=await readFile(new URL('./email-marketing-connections.down.sql',import.meta.url),'utf8');
  await assert.rejects(()=>pool.query(down),(e:unknown)=>e instanceof Error&&e.message==='EMAIL_MARKETING_ROLLBACK_RETAINED_EVIDENCE');
  await pool.query('ROLLBACK');
  const engagement=await readFile(new URL('./202610040215_store_engagement_assertions.sql',import.meta.url),'utf8');
  const fixture=engagement.slice(engagement.indexOf('DO $fixture$'),engagement.indexOf('END $fixture$;')+'END $fixture$;'.length).replaceAll('saas.store_engagement_contact_capture(','saas.email_marketing_contact_capture(').replace('END $fixture$;',`IF EXISTS(SELECT 1 FROM saas.email_marketing_consent_events WHERE store_id=a.store_id AND source='cart_capture') THEN RAISE EXCEPTION 'EMAIL_OPTIONAL_CAPTURE_FALSE_CREATED_PERMISSION';END IF;
   SELECT * INTO r FROM saas.email_marketing_newsletter_subscribe(a.hostname,n,'newsletter-fixture@example.test','newsletter-v1');
   SELECT * INTO r FROM saas.email_marketing_newsletter_subscribe(a.hostname,n+interval '1 minute','newsletter-fixture@example.test','newsletter-v1');
   IF (SELECT count(*) FROM saas.email_marketing_consent_events WHERE store_id=a.store_id AND email='newsletter-fixture@example.test' AND kind='grant')<>1 OR NOT EXISTS(SELECT 1 FROM saas.email_marketing_audience WHERE store_id=a.store_id AND email='newsletter-fixture@example.test' AND consented_at=n) THEN RAISE EXCEPTION 'EMAIL_NEWSLETTER_REPLAY_RESET_EVIDENCE';END IF;
   END $fixture$;`);
  await pool.query('BEGIN; SET LOCAL ROLE celebix_saas_owner;'+fixture+'ROLLBACK;');

 }finally{await pool.end();}
});
