-- Isolated native PostgreSQL only. No remote endpoint/provider/key. All new
-- promotions, campaigns, reservations and zero-value order fixtures roll back.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF current_database()<>'email_marketing_isolated' OR current_setting('listen_addresses')<>'' THEN RAISE EXCEPTION 'DISCOUNT_DELETE_ISOLATED_DATABASE_REQUIRED';END IF;
 IF to_regprocedure('saas.promotion_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NULL THEN RAISE EXCEPTION 'PROMOTION_DELETE_NATIVE_MISSING';END IF;
 -- The real owner bypasses RLS. Correctness must come from explicit guards.
 IF NOT(SELECT rolbypassrls FROM pg_roles WHERE rolname='celebix_saas_owner') THEN RAISE EXCEPTION 'EXPECTED_OWNER_BYPASSRLS_BASELINE';END IF;
 IF has_table_privilege('celebix_saas_app','saas.promotion_deletions','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_host_resolver','saas.promotion_deletions','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'DELETION_DIRECT_ACCESS';END IF;
 IF(SELECT count(*) FROM saas.promotion_deletion_function_baseline)<>24 THEN RAISE EXCEPTION 'EXPECTED_24_NARROW_GUARDS';END IF;
 IF EXISTS(SELECT 1 FROM saas.promotion_deletion_function_baseline b JOIN pg_proc p ON p.oid=to_regprocedure(b.identity) WHERE md5(pg_get_functiondef(p.oid))<>b.patched_hash OR p.proowner<>b.owner_oid OR p.proacl::text IS DISTINCT FROM b.acl) THEN RAISE EXCEPTION 'DELETION_NATIVE_AUTH_OR_BODY_DRIFT';END IF;
 IF NOT has_function_privilege('celebix_saas_app','saas.promotion_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','EXECUTE')
 OR has_function_privilege('celebix_saas_host_resolver','saas.promotion_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','EXECUTE')
 OR has_function_privilege('celebix_saas_app','saas.promotion_is_deleted_v1(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'DELETION_EXECUTE_GRANTS';END IF;
END $guard$;
DO $fixture$
DECLARE n timestamptz:=date_trunc('milliseconds',clock_timestamp());a record;b record;r record;r2 record;
 promo uuid:=gen_random_uuid();pending uuid:=gen_random_uuid();expired uuid:=gen_random_uuid();batch uuid:=gen_random_uuid();campaign uuid;op uuid:=gen_random_uuid();create_op uuid:=gen_random_uuid();create_fp text;fp text;receipt jsonb;rule jsonb;rule2 jsonb;config jsonb;context jsonb;
 code text:='DELETE'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));code2 text:='HOLD'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
 reservation_op uuid:=gen_random_uuid();reservation_fp text;group_id uuid;order_id uuid:=gen_random_uuid();commit_op uuid:=gen_random_uuid();redemption_group uuid;commit_fp text;history_before jsonb;overview_before jsonb;versions_before jsonb;old_batch_op uuid:=gen_random_uuid();batch_fp text;reuse uuid:=gen_random_uuid();
 legacy uuid:=gen_random_uuid();legacy_op uuid:=gen_random_uuid();legacy_archived uuid:=gen_random_uuid();legacy_archive_op uuid:=gen_random_uuid();legacy_archived_promo uuid:=gen_random_uuid();other_kind uuid:=gen_random_uuid();other_op uuid:=gen_random_uuid();legacy_config jsonb:='{"discountType":"percent","value":15}';other_before jsonb;
BEGIN
 SELECT m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version,st.currency INTO a
 FROM saas.memberships m JOIN saas.subscriptions s ON s.store_id=m.store_id JOIN saas.stores st ON st.id=m.store_id
 WHERE saas.promotion_authority_error(m.store_id,m.principal_id,m.id,s.plan_id,s.plan_code,s.plan_version,n,'promotions.archive') IS NULL
 ORDER BY m.store_id,m.id LIMIT 1;
 SELECT m.store_id,m.principal_id,m.id membership_id,s.plan_id,s.plan_code,s.plan_version,st.currency INTO b
 FROM saas.memberships m JOIN saas.subscriptions s ON s.store_id=m.store_id JOIN saas.stores st ON st.id=m.store_id
 WHERE m.store_id<>a.store_id AND saas.promotion_authority_error(m.store_id,m.principal_id,m.id,s.plan_id,s.plan_code,s.plan_version,n,'promotions.archive') IS NULL ORDER BY m.store_id,m.id LIMIT 1;
 IF a.store_id IS NULL OR b.store_id IS NULL THEN RAISE EXCEPTION 'TWO_ACTIVE_ISOLATED_AUTHORITIES_REQUIRED';END IF;
 rule:=jsonb_build_object('schemaVersion',1,'benefit',jsonb_build_object('kind','free_shipping'),'targets',jsonb_build_object('mode','all','include','[]'::jsonb,'exclude','[]'::jsonb),'audience',jsonb_build_object('mode','everyone'),'trigger',jsonb_build_object('kind','code','codes',jsonb_build_array(code)),'schedule',jsonb_build_object('timezone','Europe/Istanbul'),'limits',jsonb_build_object('totalUsage',NULL,'perCustomerUsage',NULL,'budgetMinor',NULL,'orderMaximumMinor',NULL),'conditions',jsonb_build_object('minimumBasketMinor',0,'minimumQuantity',0,'minimumProductQuantity',0),'combinationPolicy',jsonb_build_object('kind','none'),'priority',0,'marginPolicy',jsonb_build_object('kind','warn'),'progressMessagePolicy',jsonb_build_object('enabled',false));
 SELECT * INTO r FROM saas.merchant_admin_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,legacy_op,repeat('e',64),legacy,NULL,'discount','Isolated legacy discount',legacy_config,'active');
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'DELETE_LEGACY_SETUP:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.merchant_admin_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,other_op,repeat('f',64),other_kind,NULL,'lucky_wheel','Isolated unrelated record','{}'::jsonb,'active');
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'DELETE_OTHER_KIND_SETUP:%',r.outcome;END IF;
 SELECT result_payload INTO other_before FROM saas.merchant_admin_get_record(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,'lucky_wheel',other_kind);
 create_fp:=saas.promotion_operation_fingerprint_v2('create',a.store_id,jsonb_build_object('name','Isolated permanent delete','ruleDocument',rule));
 SELECT * INTO r FROM saas.promotion_create_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,create_op,create_fp,promo,'Isolated permanent delete',rule);
 IF r.outcome<>'created' THEN RAISE EXCEPTION 'DELETE_NATIVE_CREATE:%',r.outcome;END IF;
 UPDATE saas.promotions SET legacy_record_id=legacy WHERE store_id=a.store_id AND id=promo;
 SELECT * INTO r FROM saas.promotion_lifecycle_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),saas.promotion_operation_fingerprint_v2('lifecycle',a.store_id,jsonb_build_object('id',promo,'expectedVersion',1,'nextStatus','active')),promo,1,'active');
 IF r.outcome<>'updated' THEN RAISE EXCEPTION 'DELETE_NATIVE_PUBLISH:%',r.outcome;END IF;
 batch_fp:=saas.promotion_operation_fingerprint_v2('code_batch',a.store_id,jsonb_build_object('promotionId',promo,'count',3,'prefix','DEL','codeLength',20,'perCustomerUsage',1,'expiresAt',NULL));
 SELECT * INTO r FROM saas.promotion_create_code_batch_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n+interval '1 millisecond',old_batch_op,batch_fp,batch,promo,3,'DEL',20,1,NULL);
 IF r.outcome<>'created' THEN RAISE EXCEPTION 'DELETE_NATIVE_BATCH:%',r.outcome;END IF;
 config:=jsonb_build_object('schemaVersion',1,'template','discount','heading','Fixture','body','Fixture','buttonLabel','Close','delaySeconds',0,'repeatDays',7,'devices',jsonb_build_object('desktop',true,'mobile',true),'collectMode','either','promotionId',promo);
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('a',64),NULL,NULL,'popup','Isolated linked popup',true,config);
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'DELETE_POPUP_SETUP:%',r.outcome;END IF;campaign:=(r.result_payload->>'id')::uuid;
 SELECT * INTO r FROM saas.promotion_delete_impact_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,promo);
 IF r.outcome<>'found' OR r.result_payload->'canDelete'<>'false'::jsonb OR r.result_payload->>'codeCount'<>'4' OR jsonb_array_length(r.result_payload->'linkedTools')<>1 THEN RAISE EXCEPTION 'DELETE_ACTIVE_LINK_PREVIEW';END IF;
 fp:=saas.promotion_delete_fingerprint_v1(a.store_id,promo,2);
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,op,fp,promo,2);
 IF r.outcome<>'deletion_blocked' OR saas.promotion_projection(a.store_id,promo)->>'status'<>'active' THEN RAISE EXCEPTION 'DELETE_ACTIVE_LINK_MUTATION';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('b',64),campaign,1,'popup','Isolated linked popup',false,config);
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'DELETE_DISABLE_LINK:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.promotion_delete_v1(b.store_id,b.principal_id,b.membership_id,b.plan_id,b.plan_code,b.plan_version,n,gen_random_uuid(),saas.promotion_delete_fingerprint_v1(b.store_id,promo,2),promo,2);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'DELETE_CROSS_TENANT';END IF;
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,gen_random_uuid(),a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),fp,promo,2);
 IF r.outcome<>'membership_denied' THEN RAISE EXCEPTION 'DELETE_FORGED_PRINCIPAL:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),saas.promotion_delete_fingerprint_v1(a.store_id,promo,1),promo,1);
 IF r.outcome<>'version_conflict' OR r.result_payload->>'version'<>'2' THEN RAISE EXCEPTION 'DELETE_EXPECTED_VERSION';END IF;
 context:=jsonb_build_object('storeId',a.store_id,'customerId',NULL,'paidOrderCount',0,'customerSegmentIds','[]'::jsonb,'customerTagIds','[]'::jsonb,'cartLines','[]'::jsonb,'shippingMethodId',NULL,'paymentMethodId',NULL,'shippingBeforeDiscountMinor',1000,'currency',a.currency,'storeLocalTime',to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'salesChannel','quick_order','submittedCodes',jsonb_build_array(code),'abandonedCart',NULL);
 reservation_fp:=saas.promotion_operation_fingerprint_v2('reserve',a.store_id,jsonb_build_object('sourceKind','offline_checkout','sourceReference',order_id::text,'evaluatorContext',context));
 SELECT * INTO r FROM saas.promotion_reserve_group_v1(a.store_id,reservation_op,reservation_fp,'offline_checkout',order_id::text,context,n);
 IF r.outcome<>'reserved' THEN RAISE EXCEPTION 'DELETE_RESERVE_FIXTURE:%',r.outcome;END IF;group_id:=(r.result_payload->>'reservationGroupId')::uuid;
 SELECT * INTO r FROM saas.promotion_delete_impact_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,promo);
 IF r.result_payload->>'pendingReservationCount'<>'1' OR r.result_payload->'canDelete'<>'false'::jsonb THEN RAISE EXCEPTION 'DELETE_PENDING_PREVIEW';END IF;
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,op,fp,promo,2);
 IF r.outcome<>'deletion_blocked' OR EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=a.store_id AND promotion_id=promo) THEN RAISE EXCEPTION 'DELETE_PENDING_MUTATION';END IF;
 -- Reserved obligations stay protected even after the timer; provider settlement
 -- must explicitly terminalize them before a discount can be removed.
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n+interval '16 minutes',op,fp,promo,2);
 IF r.outcome<>'deletion_blocked' THEN RAISE EXCEPTION 'DELETE_EXPIRED_RESERVED_OBLIGATION:%',r.outcome;END IF;
 -- A completed zero-value synthetic order with real native commit/snapshots.
 INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at,paid_at)
 VALUES(order_id,a.store_id,'DELETE-FIXTURE-'||order_id::text,'manual_import','Isolated fixture','fixture@example.test',a.currency,0,1000,1000,0,'confirmed','completed','{}'::jsonb,1,n,n,n);
 commit_fp:=saas.promotion_operation_fingerprint_v2('commit',a.store_id,jsonb_build_object('reservationGroupId',group_id,'orderId',order_id));
 SELECT * INTO r FROM saas.promotion_commit_reservation_group_v1(a.store_id,commit_op,commit_fp,group_id,order_id,n);
 IF r.outcome<>'committed' THEN RAISE EXCEPTION 'DELETE_COMMIT_FIXTURE:%',r.outcome;END IF;redemption_group:=(r.result_payload->>'redemptionGroupId')::uuid;
 IF NOT saas.promotion_commit_integrity_valid_v1(a.store_id,redemption_group) THEN RAISE EXCEPTION 'DELETE_COMMIT_BASELINE_INTEGRITY';END IF;
 SELECT jsonb_build_object('reservation',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM saas.promotion_usage_reservations t WHERE store_id=a.store_id AND promotion_id=promo),'redemption',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM saas.promotion_redemptions t WHERE store_id=a.store_id AND promotion_id=promo),'snapshot',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM saas.order_promotion_snapshots t WHERE store_id=a.store_id AND promotion_id=promo),'order',(SELECT to_jsonb(t) FROM saas.orders t WHERE store_id=a.store_id AND id=order_id)) INTO history_before;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY version) INTO versions_before FROM saas.promotion_versions t WHERE store_id=a.store_id AND promotion_id=promo;
 SELECT result_payload->'currencies' INTO overview_before FROM saas.promotion_overview_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,30);
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,op,fp,promo,2);
 IF r.outcome<>'deleted' OR r.result_payload<>jsonb_build_object('id',promo,'deletedAt',to_char(n AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) THEN RAISE EXCEPTION 'DELETE_RECEIPT:%',r.outcome;END IF;receipt:=r.result_payload;
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,op,fp,promo,2);
 IF r.outcome<>'operation_replayed' OR r.result_payload<>receipt THEN RAISE EXCEPTION 'DELETE_REPLAY';END IF;
 SELECT * INTO r FROM saas.promotion_delete_recover_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,op,fp);
 IF r.outcome<>'operation_replayed' OR r.result_payload<>receipt THEN RAISE EXCEPTION 'DELETE_RECOVERY';END IF;
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,op,saas.promotion_delete_fingerprint_v1(a.store_id,promo,3),promo,3);
 IF r.outcome<>'operation_mismatch' THEN RAISE EXCEPTION 'DELETE_CHANGED_REPLAY';END IF;
 IF saas.promotion_projection(a.store_id,promo) IS NOT NULL THEN RAISE EXCEPTION 'DELETE_DETAIL_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_list_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,'Isolated permanent delete',ARRAY['archived'],100);
 IF jsonb_array_length(r.result_payload->'items')<>0 THEN RAISE EXCEPTION 'DELETE_LEGACY_LIST_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_list_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,'Isolated permanent delete',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL,NULL,100,NULL,NULL,NULL);
 IF jsonb_array_length(r.result_payload->'items')<>0 THEN RAISE EXCEPTION 'DELETE_KEYSET_LIST_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_code_batch_list_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,promo,100,NULL,NULL,NULL);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'DELETE_BATCH_LIST_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_codes_csv_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,batch);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'DELETE_CSV_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_code_batch_status_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,batch,'revoked');
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'DELETE_LEGACY_BATCH_REPLAY_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_recover_operation_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,create_op,'create',create_fp);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'DELETE_OLD_RECOVERY_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_create_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,create_op,create_fp,promo,'Isolated permanent delete',rule);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'DELETE_OLD_CREATE_REPLAY_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_create_code_batch_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,old_batch_op,batch_fp,batch,promo,3,'DEL',20,1,NULL);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'DELETE_OLD_BATCH_REPLAY_VISIBLE';END IF;
 -- Every public generic legacy path delegates to the guarded terminal bodies.
 SELECT * INTO r FROM saas.merchant_admin_list(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,'discount');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r.result_payload->'items') item WHERE item->>'id'=legacy::text) THEN RAISE EXCEPTION 'DELETE_GENERIC_LEGACY_LIST_VISIBLE';END IF;
 SELECT * INTO r FROM saas.merchant_admin_get_record(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,'discount',legacy);
 IF r.outcome<>'record_not_found' THEN RAISE EXCEPTION 'DELETE_GENERIC_LEGACY_GET_VISIBLE';END IF;
 SELECT * INTO r FROM saas.merchant_admin_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('e',64),legacy,1,'discount','Isolated legacy discount',legacy_config,'active');
 IF r.outcome<>'record_not_found' THEN RAISE EXCEPTION 'DELETE_GENERIC_LEGACY_SAVE_SUCCEEDED';END IF;
 SELECT * INTO r FROM saas.merchant_admin_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,legacy_op,repeat('e',64),legacy,NULL,'discount','Isolated legacy discount',legacy_config,'active');
 IF r.outcome<>'record_not_found' THEN RAISE EXCEPTION 'DELETE_GENERIC_LEGACY_SAVE_REPLAY_VISIBLE';END IF;
 SELECT * INTO r FROM saas.merchant_admin_recover_operation(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,legacy_op,repeat('e',64));
 IF r.outcome<>'record_not_found' THEN RAISE EXCEPTION 'DELETE_GENERIC_LEGACY_RECOVERY_VISIBLE';END IF;
 SELECT * INTO r FROM saas.merchant_admin_archive(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('e',64),legacy,1);
 IF r.outcome<>'record_not_found' THEN RAISE EXCEPTION 'DELETE_GENERIC_LEGACY_ARCHIVE_SUCCEEDED';END IF;
 SELECT * INTO r FROM saas.merchant_admin_get_record(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,'lucky_wheel',other_kind);
 IF r.outcome<>'found' OR r.result_payload IS DISTINCT FROM other_before THEN RAISE EXCEPTION 'DELETE_OTHER_KIND_CHANGED';END IF;
 SELECT * INTO r FROM saas.merchant_admin_recover_operation(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,other_op,repeat('f',64));
 IF r.outcome<>'operation_replayed' THEN RAISE EXCEPTION 'DELETE_OTHER_KIND_REPLAY_CHANGED';END IF;
 SELECT * INTO r FROM saas.merchant_admin_list_events(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,'discount');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.result_payload->'items') item WHERE item->>'recordId'=legacy::text) THEN RAISE EXCEPTION 'DELETE_GENERIC_HISTORY_LOST';END IF;
 SELECT * INTO r FROM saas.promotion_legacy_resolve_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,legacy);
 IF r.outcome<>'not_found' THEN RAISE EXCEPTION 'DELETE_CANONICAL_LEGACY_RESOLVE_VISIBLE';END IF;
 SELECT * INTO r FROM saas.promotion_legacy_list_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,100,NULL,NULL,NULL);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r.result_payload->'items') item WHERE item->>'legacyRecordId'=legacy::text) THEN RAISE EXCEPTION 'DELETE_CANONICAL_LEGACY_LIST_VISIBLE';END IF;
 -- Retained archive receipts also stay unavailable after deleting the parent.
 SELECT * INTO r FROM saas.merchant_admin_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('e',64),legacy_archived,NULL,'discount','Isolated archived legacy discount',legacy_config,'active');
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'DELETE_ARCHIVE_REPLAY_SETUP';END IF;
 SELECT * INTO r FROM saas.merchant_admin_archive(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,legacy_archive_op,repeat('e',64),legacy_archived,1);
 IF r.outcome<>'archived' THEN RAISE EXCEPTION 'DELETE_ARCHIVE_REPLAY_SETUP_2';END IF;
 rule2:=jsonb_set(rule,'{trigger,codes}',jsonb_build_array(code2));
 SELECT * INTO r FROM saas.promotion_create_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),saas.promotion_operation_fingerprint_v2('create',a.store_id,jsonb_build_object('name','Isolated draft delete','ruleDocument',rule2)),legacy_archived_promo,'Isolated draft delete',rule2);
 IF r.outcome<>'created' THEN RAISE EXCEPTION 'DELETE_DRAFT_SETUP';END IF;
 UPDATE saas.promotions SET legacy_record_id=legacy_archived WHERE store_id=a.store_id AND id=legacy_archived_promo;
 SELECT * INTO r FROM saas.promotion_delete_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),saas.promotion_delete_fingerprint_v1(a.store_id,legacy_archived_promo,1),legacy_archived_promo,1);
 IF r.outcome<>'deleted' THEN RAISE EXCEPTION 'DELETE_DIRECT_DRAFT';END IF;
 SELECT * INTO r FROM saas.merchant_admin_archive(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,legacy_archive_op,repeat('e',64),legacy_archived,1);
 IF r.outcome<>'record_not_found' THEN RAISE EXCEPTION 'DELETE_GENERIC_LEGACY_ARCHIVE_REPLAY_VISIBLE';END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('c',64),campaign,2,'popup','Edited disabled linked popup',false,config);
 IF r.outcome<>'saved' THEN RAISE EXCEPTION 'DELETE_DISABLED_LINK_EDIT:%',r.outcome;END IF;
 SELECT * INTO r FROM saas.store_engagement_campaign_save(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,gen_random_uuid(),repeat('d',64),campaign,3,'popup','Edited disabled linked popup',true,config);
 IF r.outcome<>'invalid_reference' THEN RAISE EXCEPTION 'DELETE_LINK_REENABLE';END IF;
 IF jsonb_array_length(saas.promotion_evaluate_v1(a.store_id,context,n)->'appliedPromotions')<>0 OR saas.store_engagement_coupon(a.store_id,promo,n) IS NOT NULL THEN RAISE EXCEPTION 'DELETE_COUPON_EVALUATED';END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.promotion_code_batches WHERE store_id=a.store_id AND id=batch AND created_at=n+interval '1 millisecond' AND updated_at=created_at AND status='revoked') THEN RAISE EXCEPTION 'DELETE_CONCURRENT_NEWER_BATCH_TIMESTAMP';END IF;
 IF EXISTS(SELECT 1 FROM saas.promotion_codes WHERE store_id=a.store_id AND promotion_id=promo AND status<>'revoked') OR EXISTS(SELECT 1 FROM saas.promotion_targets WHERE store_id=a.store_id AND promotion_id=promo) THEN RAISE EXCEPTION 'DELETE_OPERATIONAL_STATE_LIVE';END IF;
 IF history_before IS DISTINCT FROM jsonb_build_object('reservation',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM saas.promotion_usage_reservations t WHERE store_id=a.store_id AND promotion_id=promo),'redemption',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM saas.promotion_redemptions t WHERE store_id=a.store_id AND promotion_id=promo),'snapshot',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM saas.order_promotion_snapshots t WHERE store_id=a.store_id AND promotion_id=promo),'order',(SELECT to_jsonb(t) FROM saas.orders t WHERE store_id=a.store_id AND id=order_id))
 OR versions_before IS DISTINCT FROM(SELECT jsonb_agg(to_jsonb(t) ORDER BY version) FROM saas.promotion_versions t WHERE store_id=a.store_id AND promotion_id=promo)
 OR NOT saas.promotion_commit_integrity_valid_v1(a.store_id,redemption_group) THEN RAISE EXCEPTION 'DELETE_HISTORY_OR_SETTLEMENT_CHANGED';END IF;
 SELECT * INTO r FROM saas.promotion_overview_v1(a.store_id,a.principal_id,a.membership_id,a.plan_id,a.plan_code,a.plan_version,n,30);
 IF r.result_payload->'currencies' IS DISTINCT FROM overview_before THEN RAISE EXCEPTION 'DELETE_FINANCIAL_OVERVIEW_CHANGED';END IF;
 SELECT * INTO r FROM saas.promotion_recover_settlement_operation_v1(a.store_id,n,commit_op,'commit',commit_fp);
 IF r.outcome<>'recovered' THEN RAISE EXCEPTION 'DELETE_SETTLEMENT_RECOVERY_CHANGED:%',r.outcome;END IF;
 BEGIN UPDATE saas.promotions SET status='active' WHERE store_id=a.store_id AND id=promo;RAISE EXCEPTION 'DELETE_REACTIVATION_SUCCEEDED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROMOTION_PERMANENTLY_DELETED' THEN RAISE;END IF;END;
 BEGIN UPDATE saas.promotion_codes SET status='active' WHERE store_id=a.store_id AND promotion_id=promo;RAISE EXCEPTION 'DELETE_CODE_REACTIVATION_SUCCEEDED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROMOTION_PERMANENTLY_DELETED' THEN RAISE;END IF;END;
 BEGIN DELETE FROM saas.promotion_deletions WHERE store_id=a.store_id AND promotion_id=promo;RAISE EXCEPTION 'DELETE_RECEIPT_REMOVE_SUCCEEDED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROMOTION_DELETION_IMMUTABLE' THEN RAISE;END IF;END;
 -- Two stores remain unrelated; no historical rows are generated by a replay.
 IF(SELECT count(*) FROM saas.promotion_deletions WHERE store_id=a.store_id AND promotion_id=promo)<>1 OR EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=b.store_id AND promotion_id=promo) THEN RAISE EXCEPTION 'DELETE_REPLAY_OR_SCOPE_CHANGED';END IF;
 RAISE NOTICE 'PERMANENT_DELETE PASS: direct delete/replay/recovery/CAS/store isolation/forged authority/active links/pending obligations/legacy reader guards/disabled-link edit/coupon terminality/immutable receipt/native committed settlement and finance history';
END $fixture$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
