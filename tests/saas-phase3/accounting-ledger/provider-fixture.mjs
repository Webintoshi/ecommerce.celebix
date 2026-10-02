import { randomUUID } from 'node:crypto';

// Synthetic immutable provider evidence. Every normal table constraint and
// binding trigger remains enabled in the disposable PostgreSQL database.
export async function capturedWebOrder(pool, store, customer) {
  const orderId=randomUUID(), profileId=randomUUID(), methodId=randomUUID(), attemptId=randomUUID(), cartId=randomUUID();
  const digest=`sha256:${'b'.repeat(64)}`;
  await pool.query("INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at) VALUES('paytr_iframe','payment_processing','test',987,$1,'sandbox_ready',true,'2026-09-01')",[digest]);
  await pool.query(`INSERT INTO saas.merchant_provider_profiles(
    id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
    credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,
    last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,
    execution_evidence_digest,validation_environment,validation_adapter_version
  ) VALUES($1,$2,'paytr_iframe','payment_processing','{"environment":"test"}','Synthetic provider',
    '{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"provider.current","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}',
    repeat('3',64),'provider.current',1,1,'active',1,'2026-09-01','2026-09-01','2026-09-01','test',987,$3,'test',987)`,[profileId,store,digest]);
  await pool.query(`INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,version,created_at,updated_at)
    VALUES($1,$2,'provider',$3,'paytr_iframe','Synthetic PayTR','active',900,
    '{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"single_payment","maxInstallment":0}',1,'2026-09-01','2026-09-01')`,[methodId,store,profileId]);
  await pool.query(`INSERT INTO saas.payment_attempts(id,store_id,payment_method_id,profile_id,provider_code,environment,credential_version,order_reference,amount_minor,currency,status,safe_code,version,created_at,updated_at)
    VALUES($1,$2,$3,$4,'paytr_iframe','test',1,$5,90000,'TRY','captured','captured',2,'2026-09-30T20:59:00Z','2026-10-01T00:05:00Z')`,[attemptId,store,methodId,profileId,`WEB-${orderId}`]);
  await pool.query(`INSERT INTO saas.payment_attempt_events(event_id,attempt_id,store_id,profile_id,provider_code,environment,source,from_status,to_status,attempt_version,safe_code,event_key_digest,payload_fingerprint,occurred_at)
    VALUES($1,$2,$3,$4,'paytr_iframe','test','callback','awaiting_customer','captured',2,'captured',repeat('4',64),repeat('5',64),'2026-09-30T21:00:00Z')`,[randomUUID(),attemptId,store,profileId]);
  await pool.query(`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at)
    VALUES($1,$2,$3,'storefront','Synthetic provider customer','provider@accounting.invalid','TRY',90000,0,0,90000,'delivered','completed',
    '{"recipientName":"Synthetic provider customer","line1":"Fixture","city":"Fixture","country":"TR"}','2026-09-01','2026-10-01','2026-09-01')`,[orderId,store,`WEB-${orderId}`]);
  await pool.query("INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at) VALUES($1,$2,'converted',1,'2026-10-02','2026-09-30T20:59:00Z','2026-10-01T00:05:00Z')",[cartId,store]);
  await pool.query(`INSERT INTO saas.storefront_hosted_checkout_sessions(
    id,store_id,cart_id,payment_attempt_id,payment_method_id,profile_id,provider_code,environment,
    credential_version,execution_adapter_version,execution_evidence_digest,order_reference,order_id,
    customer_id,address_id,event_id,receipt_id,customer_credential_id,source_version,commerce_authority_digest,
    currency,subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,
    status,safe_code,hold_expires_at,terminal_at,version,payment_session_key_id,payment_session_credential_digest,
    payment_session_expires_at,receipt_key_id,receipt_credential_digest,receipt_expires_at,customer_key_id,
    customer_credential_digest,customer_expires_at,created_at,updated_at
  ) VALUES($1,$2,$3,$4,$5,$6,'paytr_iframe','test',1,987,$7,$8,$9,$10,$11,$12,$13,$14,1,repeat('6',64),
    'TRY',90000,0,0,90000,'{}','[{"name":"Synthetic provider item"}]','captured','captured',
    '2026-09-30T21:14:00Z','2026-10-01T00:05:00Z',2,'test',repeat('7',64),'2026-09-30T21:14:00Z',
    'test',repeat('8',64),'2026-10-01T20:59:00Z','test',repeat('9',64),'2026-10-02T20:59:00Z',
    '2026-09-30T20:59:00Z','2026-10-01T00:05:00Z')`,
  [randomUUID(),store,cartId,attemptId,methodId,profileId,digest,`WEB-${orderId}`,orderId,customer,randomUUID(),randomUUID(),randomUUID(),randomUUID()]);
  return orderId;
}
