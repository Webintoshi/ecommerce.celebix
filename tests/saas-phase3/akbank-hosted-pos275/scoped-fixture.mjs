import assert from 'node:assert/strict';
/** Synthetic historical sessions exist only in the socket-only disposable cluster. */
export function verifyScopedFairness({sql,j,lit,id,NOW,EVIDENCE,config}) {
 const queryNow='2026-10-25T13:00:00.000Z';
 const scopes=['paytr_iframe','iyzico_iframe','akbank_json'].flatMap(providerCode=>['test','live'].map(environment=>({providerCode,environment,adapterVersion:1,evidenceDigest:EVIDENCE})));
 let fixture='BEGIN;SET LOCAL session_replication_role=replica;';
 // Existing provider rows are older than Akbank and must not consume an Akbank-only LIMIT.
 fixture+=`INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)VALUES('paytr_iframe','payment_processing','live',1,'${EVIDENCE}','production_ready',true,${lit(NOW)})ON CONFLICT(provider_code,environment)DO UPDATE SET enabled=true,adapter_version=1,evidence_digest=EXCLUDED.evidence_digest;`;
 const entries=[...Array.from({length:26},(_,n)=>({n:n+1,provider:'paytr_iframe',store:5,profile:500,method:501,created:NOW})),
   {n:30,provider:'akbank_json',store:2,profile:102,method:102,created:'2026-10-25T12:01:00.000Z'},
   {n:31,provider:'akbank_json',store:2,profile:102,method:102,created:'2026-10-25T12:02:00.000Z',digest:'sha256:'+'d'.repeat(64)},
   {n:32,provider:'akbank_json',store:2,profile:102,method:102,created:'2026-10-25T12:03:00.000Z',lease:true}];
 for(const entry of entries){
  const offset=10000+entry.n*20,attempt=id(offset),session=id(offset+1),cart=id(offset+2),created=lit(entry.created),digest=entry.digest??EVIDENCE;
  const methodConfig=JSON.stringify({...config,installmentMode:entry.provider==='akbank_json'?'single_payment':'all'});
  fixture+=`INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)VALUES('${cart}','${id(entry.store)}','active',1,'2026-10-27',${created},${created});
  INSERT INTO saas.payment_attempts(id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,execution_adapter_version,execution_evidence_digest,order_reference,amount_minor,currency,status,safe_provider_reference,safe_code,version,created_at,updated_at,method_config_snapshot,reconciliation_lease_id,reconciliation_lease_owner,reconciliation_lease_expires_at)
  VALUES('${attempt}','${id(entry.store)}','${id(entry.method)}','${id(entry.profile)}','${entry.provider}','live',1,1,'${digest}','sf:${session}',1000,'TRY','${entry.lease?'reconciliation_required':'provider_outcome_unknown'}','fixture-ref-${entry.n}','fixture_pending',3,${created},${created},${lit(methodConfig)}::jsonb,${entry.lease?`'${id(offset+3)}','fixture-worker','2026-10-25T14:00:00.000Z'`:'NULL,NULL,NULL'});
  INSERT INTO saas.storefront_hosted_checkout_sessions(id,store_id,cart_id,payment_attempt_id,payment_method_id,profile_id,provider_code,environment,credential_version,execution_adapter_version,execution_evidence_digest,order_reference,order_id,customer_id,address_id,event_id,receipt_id,customer_credential_id,source_version,commerce_authority_digest,currency,subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,status,safe_code,hold_expires_at,version,payment_session_key_id,payment_session_credential_digest,payment_session_expires_at,receipt_key_id,receipt_credential_digest,receipt_expires_at,customer_key_id,customer_credential_digest,customer_expires_at,created_at,updated_at)
  VALUES('${session}','${id(entry.store)}','${cart}','${attempt}','${id(entry.method)}','${id(entry.profile)}','${entry.provider}','live',1,1,'${digest}','sf:${session}','${id(offset+4)}','${id(offset+5)}','${id(offset+6)}','${id(offset+7)}','${id(offset+8)}','${id(offset+9)}',1,'${'2'.repeat(64)}','TRY',1000,0,0,1000,'{}','[{"fixture":true}]','processing','fixture_pending',${created}::timestamptz+interval '15 minutes',1,'fixture_pay','${'3'.repeat(64)}',${created}::timestamptz+interval '15 minutes','fixture_receipt','${'4'.repeat(64)}',${created}::timestamptz+interval '1 day','fixture_customer','${'5'.repeat(64)}',${created}::timestamptz+interval '30 days',${created},${created});`;
 }
 sql(fixture+'COMMIT;');
 const selected=(scope,limit=25)=>j(`BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_workflow;SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY candidate_position),'[]'::jsonb)FROM saas.storefront_hosted_checkout_reconciliation_candidates_scoped('${queryNow}',${limit},${lit(JSON.stringify(scope))}::jsonb)r;COMMIT;`);
 const bankScope=scopes.filter(s=>s.providerCode==='akbank_json'&&s.environment==='live');
 assert.equal(selected(bankScope,1)[0]?.provider_code,'akbank_json');
 assert.equal(selected(bankScope).length,1,'wrong evidence and unexpired lease stay excluded');
 const all=selected(scopes);assert.equal(all.length,25);assert.ok(all.every(r=>r.provider_code==='paytr_iframe'));
 for(const bad of [[...scopes,scopes[0]],[{...bankScope[0],providerCode:'akbank'}],[...scopes.slice(0,5),scopes[0]]])assert.deepEqual(selected(bad),[]);
 const bank=selected(bankScope)[0];assert.equal(bank.evidence_digest,EVIDENCE);
 sql(`SET ROLE celebix_saas_owner;UPDATE saas.merchant_provider_execution_authorities SET enabled=false WHERE provider_code='akbank_json'AND environment='live'`);
 assert.deepEqual(selected(bankScope),[],'revoked authority excludes old attempts');
}
