-- Purchase-backed invitations and moderated reviews. Automatic requests start disabled.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.review_collection_settings (
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,delay_days integer NOT NULL DEFAULT 7 CHECK(delay_days BETWEEN 1 AND 60),
 version bigint NOT NULL CHECK(version>0),updated_at timestamptz NOT NULL
);
CREATE TABLE saas.review_collection_requests (
 id uuid PRIMARY KEY,store_id uuid NOT NULL,order_id uuid NOT NULL,product_id uuid NOT NULL,order_item_id uuid NOT NULL,
 automatic boolean NOT NULL,status text NOT NULL CHECK(status IN('queued','leased','sent','completed','failed','suppressed','requires_review')),
 scheduled_at timestamptz NOT NULL,attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
 lease_id uuid,lease_expires_at timestamptz,first_attempt_at timestamptz,
 token_hash text UNIQUE CHECK(token_hash IS NULL OR token_hash~'^[a-f0-9]{64}$'),token_expires_at timestamptz,
 recipient_hash text NOT NULL CHECK(recipient_hash~'^[a-f0-9]{64}$'),email_payload jsonb,
 provider_message_id text,error_code text,review_id uuid,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 UNIQUE(store_id,id),UNIQUE(store_id,order_id,product_id),
 FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(order_item_id) REFERENCES saas.order_items(id) ON DELETE RESTRICT,
 FOREIGN KEY(store_id,review_id) REFERENCES saas.product_reviews(store_id,id) ON DELETE RESTRICT,
 CHECK((email_payload IS NULL)=(first_attempt_at IS NULL)),CHECK(email_payload IS NULL OR jsonb_typeof(email_payload)='object'),
 CHECK((token_hash IS NULL)=(token_expires_at IS NULL)),CHECK(updated_at>=created_at)
);
CREATE INDEX review_collection_due_idx ON saas.review_collection_requests(scheduled_at,id) WHERE status IN('queued','leased');
CREATE INDEX review_collection_store_idx ON saas.review_collection_requests(store_id,created_at DESC,id DESC);
CREATE TABLE saas.review_collection_optouts(store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,recipient_hash text NOT NULL CHECK(recipient_hash~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL,PRIMARY KEY(store_id,recipient_hash));
CREATE TABLE saas.review_collection_operations(operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,action text NOT NULL,fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),result_payload jsonb NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE saas.review_collection_206_backup(identity text PRIMARY KEY,definition text NOT NULL);
INSERT INTO saas.review_collection_206_backup SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p WHERE p.oid IN('saas.product_review_projection(uuid,uuid)'::regprocedure,'saas.public_starter_review_projection(uuid,uuid)'::regprocedure);
DO $f$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['review_collection_settings','review_collection_requests','review_collection_optouts','review_collection_operations','review_collection_206_backup'] LOOP EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver',n);END LOOP;END $f$;
CREATE FUNCTION saas.review_collection_operation_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$ BEGIN RAISE EXCEPTION 'REVIEW_COLLECTION_OPERATION_IMMUTABLE';END $f$;
CREATE TRIGGER review_collection_operations_immutable BEFORE UPDATE OR DELETE ON saas.review_collection_operations FOR EACH ROW EXECUTE FUNCTION saas.review_collection_operation_immutable();
CREATE FUNCTION saas.review_collection_request_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'REVIEW_COLLECTION_REQUEST_IMMUTABLE';END IF;
 IF (NEW.store_id,NEW.order_id,NEW.product_id,NEW.order_item_id,NEW.recipient_hash,NEW.automatic,NEW.created_at) IS DISTINCT FROM (OLD.store_id,OLD.order_id,OLD.product_id,OLD.order_item_id,OLD.recipient_hash,OLD.automatic,OLD.created_at)
 OR (OLD.email_payload IS NOT NULL AND (NEW.email_payload,NEW.token_hash,NEW.token_expires_at,NEW.first_attempt_at) IS DISTINCT FROM (OLD.email_payload,OLD.token_hash,OLD.token_expires_at,OLD.first_attempt_at)) THEN RAISE EXCEPTION 'REVIEW_COLLECTION_PAYLOAD_IMMUTABLE';END IF;RETURN NEW;
END $f$;
CREATE TRIGGER review_collection_request_guard BEFORE UPDATE OR DELETE ON saas.review_collection_requests FOR EACH ROW EXECUTE FUNCTION saas.review_collection_request_guard();
CREATE FUNCTION saas.review_collection_order_eligible(p_store uuid,p_order uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.orders o WHERE o.store_id=p_store AND o.id=p_order AND o.payment_status='completed' AND o.status='delivered' AND o.source<>'manual_import'
 AND char_length(o.customer_email) BETWEEN 3 AND 320 AND o.customer_email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' AND lower(o.customer_email) NOT LIKE '%.invalid'
 AND (o.customer_id IS NULL OR EXISTS(SELECT 1 FROM saas.customers c WHERE c.store_id=o.store_id AND c.id=o.customer_id AND c.status='active'))
 AND NOT EXISTS(SELECT 1 FROM saas.customer_consents c WHERE c.store_id=o.store_id AND c.customer_id=o.customer_id AND c.channel='email' AND c.status='denied')
 AND NOT EXISTS(SELECT 1 FROM saas.review_collection_optouts x WHERE x.store_id=o.store_id AND x.recipient_hash=encode(sha256(convert_to(lower(o.customer_email),'UTF8')),'hex')))
$f$;
CREATE FUNCTION saas.review_collection_enqueue_order(p_store uuid,p_order uuid,p_automatic boolean,p_now timestamptz,p_scheduled timestamptz) RETURNS integer LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE n integer;BEGIN
 IF NOT saas.review_collection_order_eligible(p_store,p_order) THEN RETURN 0;END IF;
 INSERT INTO saas.review_collection_requests(id,store_id,order_id,product_id,order_item_id,automatic,status,scheduled_at,recipient_hash,created_at,updated_at)
 SELECT gen_random_uuid(),p_store,p_order,x.product_id,x.id,p_automatic,'queued',p_scheduled,encode(sha256(convert_to(lower(o.customer_email),'UTF8')),'hex'),p_now,p_now
 FROM saas.orders o JOIN (SELECT DISTINCT ON(i.product_id) i.id,i.product_id FROM saas.order_items i JOIN saas.products p ON p.store_id=i.store_id AND p.id=i.product_id AND p.status='active' WHERE i.store_id=p_store AND i.order_id=p_order ORDER BY i.product_id,i.position) x ON true WHERE o.store_id=p_store AND o.id=p_order ON CONFLICT(store_id,order_id,product_id) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $f$;
CREATE FUNCTION saas.review_collection_order_event() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE s saas.review_collection_settings%ROWTYPE;d timestamptz;BEGIN
 IF (NEW.event_type='status_transition' AND NEW.to_value='delivered') OR (NEW.event_type='payment_transition' AND NEW.to_value='completed') THEN
 SELECT * INTO s FROM saas.review_collection_settings WHERE store_id=NEW.store_id AND enabled;
 IF FOUND THEN SELECT max(created_at) INTO d FROM saas.order_events WHERE store_id=NEW.store_id AND order_id=NEW.order_id AND event_type='status_transition' AND to_value='delivered';IF d IS NOT NULL THEN PERFORM saas.review_collection_enqueue_order(NEW.store_id,NEW.order_id,true,NEW.created_at,greatest(NEW.created_at,d+make_interval(days=>s.delay_days)));END IF;END IF;END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER review_collection_order_event AFTER INSERT ON saas.order_events FOR EACH ROW EXECUTE FUNCTION saas.review_collection_order_event();
CREATE FUNCTION saas.review_collection_admin_overview(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;s jsonb;r jsonb;q jsonb;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_code,p_version,p_now,'catalog','catalog_admin.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 SELECT jsonb_build_object('enabled',enabled,'delayDays',delay_days,'version',version) INTO s FROM saas.review_collection_settings WHERE store_id=p_store;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',r.id,'orderId',r.order_id,'orderNumber',o.order_number,'productTitle',p.title,'customerName',o.customer_name,'status',r.status,'scheduledAt',saas.catalog_admin_timestamp(r.scheduled_at),'updatedAt',saas.catalog_admin_timestamp(r.updated_at),'errorCode',r.error_code)) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO r FROM (SELECT * FROM saas.review_collection_requests WHERE store_id=p_store ORDER BY created_at DESC,id DESC LIMIT 200) r JOIN saas.orders o ON o.store_id=r.store_id AND o.id=r.order_id JOIN saas.products p ON p.store_id=r.store_id AND p.id=r.product_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'orderNumber',o.order_number,'customerName',o.customer_name,'version',o.version,'deliveredAt',saas.catalog_admin_timestamp(o.updated_at),'productCount',o.product_count) ORDER BY o.updated_at DESC,o.id),'[]'::jsonb) INTO q FROM (SELECT o.*, (SELECT count(DISTINCT i.product_id) FROM saas.order_items i JOIN saas.products p ON p.store_id=i.store_id AND p.id=i.product_id AND p.status='active' WHERE i.store_id=o.store_id AND i.order_id=o.id AND NOT EXISTS(SELECT 1 FROM saas.review_collection_requests x WHERE x.store_id=i.store_id AND x.order_id=i.order_id AND x.product_id=i.product_id)) product_count FROM saas.orders o WHERE o.store_id=p_store AND saas.review_collection_order_eligible(o.store_id,o.id) ORDER BY o.updated_at DESC,o.id LIMIT 100) o WHERE o.product_count>0;
 RETURN QUERY SELECT 'found',jsonb_build_object('settings',coalesce(s,'{"enabled":false,"delayDays":7,"version":0}'::jsonb),'requests',r,'eligibleOrders',q);
END $f$;
CREATE FUNCTION saas.review_collection_admin_mutate(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text,p_action text,p_input jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.review_collection_operations%ROWTYPE;s saas.review_collection_settings%ROWTYPE;o saas.orders%ROWTYPE;r jsonb;n integer;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_code,p_version,p_now,'catalog','catalog_admin.moderate');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_action IS NULL OR p_action NOT IN('settings','request') OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('review.operation:'||p_operation::text,0));SELECT * INTO op FROM saas.review_collection_operations WHERE operation_id=p_operation;
 IF FOUND THEN IF (op.store_id,op.action,op.fingerprint) IS DISTINCT FROM(p_store,p_action,p_fingerprint) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload;END IF;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('review.store:'||p_store::text,0));
 IF p_action='settings' THEN
 IF NOT saas.campaign_starter_exact_keys(p_input,ARRAY['enabled','delayDays','expectedVersion']) OR jsonb_typeof(p_input->'enabled')<>'boolean' OR (p_input->>'delayDays')!~'^[0-9]+$' OR (p_input->>'expectedVersion')!~'^[0-9]+$' OR (p_input->>'delayDays')::numeric NOT BETWEEN 1 AND 60 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO s FROM saas.review_collection_settings WHERE store_id=p_store FOR UPDATE;
 IF coalesce(s.version,0)<>(p_input->>'expectedVersion')::numeric THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.review_collection_settings VALUES(p_store,(p_input->>'enabled')::boolean,(p_input->>'delayDays')::integer,1,p_now) ON CONFLICT(store_id) DO UPDATE SET enabled=excluded.enabled,delay_days=excluded.delay_days,version=saas.review_collection_settings.version+1,updated_at=p_now RETURNING jsonb_build_object('enabled',enabled,'delayDays',delay_days,'version',version) INTO r;
 IF NOT(p_input->>'enabled')::boolean THEN UPDATE saas.review_collection_requests SET status='suppressed',error_code='automatic_disabled',updated_at=p_now WHERE store_id=p_store AND automatic AND (status='queued' OR(status='leased' AND email_payload IS NULL));END IF;
 ELSE
 IF NOT saas.campaign_starter_exact_keys(p_input,ARRAY['orderId','expectedVersion']) OR (p_input->>'orderId')!~'^[a-f0-9-]{36}$' OR (p_input->>'expectedVersion')!~'^[0-9]+$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO o FROM saas.orders WHERE store_id=p_store AND id=(p_input->>'orderId')::uuid FOR UPDATE;
 IF NOT FOUND OR NOT saas.review_collection_order_eligible(p_store,o.id) THEN RETURN QUERY SELECT 'ineligible_order',NULL::jsonb;RETURN;END IF;
 IF o.version<>(p_input->>'expectedVersion')::numeric THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 n:=saas.review_collection_enqueue_order(p_store,o.id,false,p_now,p_now);r:=jsonb_build_object('queuedCount',n);
 END IF;
 INSERT INTO saas.review_collection_operations VALUES(p_operation,p_store,p_action,p_fingerprint,r,p_now);RETURN QUERY SELECT 'saved',r;
END $f$;
CREATE FUNCTION saas.review_collection_work_claim(p_now timestamptz,p_lease uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result jsonb;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_lease IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 UPDATE saas.review_collection_requests r SET status='requires_review',error_code='idempotency_window_expired',updated_at=p_now WHERE r.status IN('queued','leased') AND r.first_attempt_at IS NOT NULL AND p_now>=r.first_attempt_at+interval '24 hours';
 UPDATE saas.review_collection_requests r SET status='suppressed',error_code='order_ineligible',updated_at=p_now WHERE r.status IN('queued','leased') AND NOT saas.review_collection_order_eligible(r.store_id,r.order_id);
 WITH selected AS(SELECT r.id FROM saas.review_collection_requests r JOIN saas.stores s ON s.id=r.store_id AND s.status='active' WHERE r.scheduled_at<=p_now AND (r.status='queued' OR(r.status='leased' AND r.lease_expires_at<=p_now)) AND r.attempt_count<8 AND EXISTS(SELECT 1 FROM saas.store_domains d WHERE d.store_id=r.store_id AND d.status='active' AND d.is_primary AND d.verified_at<=p_now AND saas.store_policy_public_store(d.hostname,p_now)=r.store_id) AND (NOT r.automatic OR EXISTS(SELECT 1 FROM saas.review_collection_settings c WHERE c.store_id=r.store_id AND c.enabled)) ORDER BY r.scheduled_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 25),updated AS(UPDATE saas.review_collection_requests r SET status='leased',attempt_count=r.attempt_count+1,lease_id=p_lease,lease_expires_at=p_now+interval '90 seconds',updated_at=p_now FROM selected WHERE r.id=selected.id RETURNING r.*)
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',r.id,'leaseId',r.lease_id,'attemptCount',r.attempt_count,'firstAttemptAt',CASE WHEN r.first_attempt_at IS NULL THEN NULL ELSE saas.catalog_admin_timestamp(r.first_attempt_at) END,'email',r.email_payload,'recipient',lower(o.customer_email),'storeName',s.name,'productTitle',p.title,'origin','https://'||d.hostname)) ORDER BY r.id),'[]'::jsonb) INTO result FROM updated r JOIN saas.orders o ON o.store_id=r.store_id AND o.id=r.order_id JOIN saas.stores s ON s.id=r.store_id JOIN saas.products p ON p.store_id=r.store_id AND p.id=r.product_id JOIN LATERAL(SELECT hostname FROM saas.store_domains WHERE store_id=r.store_id AND status='active' AND is_primary AND verified_at<=p_now AND saas.store_policy_public_store(hostname,p_now)=r.store_id ORDER BY created_at,id LIMIT 1)d ON true;
 RETURN QUERY SELECT 'claimed',jsonb_build_object('items',result);
END $f$;
CREATE FUNCTION saas.review_collection_work_seal(p_id uuid,p_lease uuid,p_now timestamptz,p_token_hash text,p_email jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.review_collection_requests%ROWTYPE;BEGIN
 SELECT * INTO r FROM saas.review_collection_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'leased' OR r.lease_id<>p_lease OR r.lease_expires_at<=p_now THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb;RETURN;END IF;
 IF NOT saas.review_collection_order_eligible(r.store_id,r.order_id) OR (r.automatic AND NOT EXISTS(SELECT 1 FROM saas.review_collection_settings WHERE store_id=r.store_id AND enabled)) THEN UPDATE saas.review_collection_requests SET status='suppressed',error_code='order_ineligible',updated_at=p_now WHERE id=p_id;RETURN QUERY SELECT 'suppressed',NULL::jsonb;RETURN;END IF;
 IF r.email_payload IS NOT NULL THEN RETURN QUERY SELECT 'sealed',r.email_payload;RETURN;END IF;
 IF p_token_hash!~'^[a-f0-9]{64}$' OR NOT saas.campaign_starter_exact_keys(p_email,ARRAY['fromLabel','to','subject','html','text']) OR encode(sha256(convert_to(p_email->>'to','UTF8')),'hex')<>r.recipient_hash OR p_email->>'to'<>(SELECT lower(customer_email) FROM saas.orders WHERE store_id=r.store_id AND id=r.order_id) OR pg_column_size(p_email)>40000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 UPDATE saas.review_collection_requests SET email_payload=p_email,token_hash=p_token_hash,token_expires_at=p_now+interval '30 days',first_attempt_at=p_now,updated_at=p_now WHERE id=p_id;RETURN QUERY SELECT 'sealed',p_email;
END $f$;
CREATE FUNCTION saas.review_collection_work_finish(p_id uuid,p_lease uuid,p_now timestamptz,p_result text,p_code text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.review_collection_requests%ROWTYPE;BEGIN
 SELECT * INTO r FROM saas.review_collection_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.lease_id<>p_lease OR r.status NOT IN('leased','completed','suppressed') OR r.lease_expires_at<=p_now THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb;RETURN;END IF;
 IF p_result NOT IN('accepted','retryable','permanent') OR p_code IS NULL OR char_length(p_code) NOT BETWEEN 1 AND 200 OR p_code~'[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF r.status IN('completed','suppressed') THEN RETURN QUERY SELECT 'finished','{}'::jsonb;RETURN;END IF;
 UPDATE saas.review_collection_requests SET status=CASE WHEN p_code='idempotency_window_expired' THEN 'requires_review' WHEN p_result='accepted' THEN 'sent' WHEN p_result='retryable' AND attempt_count<8 AND p_now<first_attempt_at+interval '24 hours' THEN 'queued' WHEN p_result='retryable' THEN 'requires_review' ELSE 'failed' END,provider_message_id=CASE WHEN p_result='accepted' THEN p_code ELSE provider_message_id END,error_code=CASE WHEN p_result='accepted' THEN NULL ELSE p_code END,scheduled_at=CASE WHEN p_result='retryable' THEN p_now+make_interval(secs=>least(3600,30*power(2,attempt_count)::integer)) ELSE scheduled_at END,updated_at=p_now WHERE id=p_id;
 RETURN QUERY SELECT 'finished','{}'::jsonb;
END $f$;
CREATE FUNCTION saas.review_collection_public(p_hostname text,p_now timestamptz,p_token_hash text,p_action text,p_operation uuid,p_fingerprint text,p_input jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE s uuid;r saas.review_collection_requests%ROWTYPE;op saas.review_collection_operations%ROWTYPE;result jsonb;new_review uuid;BEGIN
 IF saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true OR p_now IS NULL OR NOT isfinite(p_now) OR p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_action IS NULL OR p_action NOT IN('get','submit','unsubscribe') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 s:=saas.store_policy_public_store(p_hostname,p_now);IF s IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.review_collection_requests WHERE store_id=s AND token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF p_action='unsubscribe' THEN INSERT INTO saas.review_collection_optouts VALUES(s,r.recipient_hash,p_now) ON CONFLICT DO NOTHING;UPDATE saas.review_collection_requests SET status='suppressed',error_code='recipient_unsubscribed',updated_at=p_now WHERE store_id=s AND recipient_hash=r.recipient_hash AND status IN('queued','leased','sent');RETURN QUERY SELECT 'unsubscribed','{}'::jsonb;RETURN;END IF;
 IF p_operation IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('review.operation:'||p_operation::text,0));SELECT * INTO op FROM saas.review_collection_operations WHERE operation_id=p_operation;IF FOUND THEN IF(op.store_id,op.action,op.fingerprint) IS DISTINCT FROM(s,'submit:'||r.id::text,p_fingerprint) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload;END IF;RETURN;END IF;END IF;
 IF r.token_expires_at<=p_now OR r.status NOT IN('sent','leased','completed','requires_review') OR NOT saas.review_collection_order_eligible(s,r.order_id) OR NOT EXISTS(SELECT 1 FROM saas.products WHERE store_id=s AND id=r.product_id AND status='active') THEN RETURN QUERY SELECT 'invitation_expired',NULL::jsonb;RETURN;END IF;
 IF p_action='get' THEN SELECT jsonb_build_object('kind',CASE WHEN r.review_id IS NULL THEN 'available' ELSE 'completed' END,'productTitle',p.title,'storeName',t.name) INTO result FROM saas.products p JOIN saas.stores t ON t.id=p.store_id WHERE p.store_id=s AND p.id=r.product_id;RETURN QUERY SELECT 'found',result;RETURN;END IF;
 IF r.review_id IS NOT NULL THEN RETURN QUERY SELECT 'already_submitted',NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR NOT saas.campaign_starter_exact_keys(p_input,ARRAY['reviewerName','rating','body']||CASE WHEN p_input?'title' THEN ARRAY['title'] ELSE ARRAY[]::text[] END)
 OR NOT saas.campaign_starter_text_valid(p_input->'reviewerName',1,120) OR p_input->'rating' NOT IN('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb) OR NOT saas.campaign_starter_text_valid(p_input->'body',1,2000) OR(p_input?'title' AND NOT saas.campaign_starter_text_valid(p_input->'title',1,200)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('review.operation:'||p_operation::text,0));
 new_review:=gen_random_uuid();INSERT INTO saas.product_reviews(id,store_id,product_id,reviewer_name,rating,review_title,review_body,status,version,created_at,updated_at) VALUES(new_review,s,r.product_id,p_input->>'reviewerName',(p_input->>'rating')::integer,p_input->>'title',p_input->>'body','pending',1,p_now,p_now);
 UPDATE saas.review_collection_requests SET status='completed',review_id=new_review,updated_at=p_now WHERE id=r.id;result:=jsonb_build_object('status','pending');INSERT INTO saas.review_collection_operations VALUES(p_operation,s,'submit:'||r.id::text,p_fingerprint,result,p_now);RETURN QUERY SELECT 'submitted',result;
END $f$;
CREATE OR REPLACE FUNCTION saas.product_review_projection(p_store_id uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object('id',r.id,'productId',r.product_id,'productTitle',p.title,'reviewerName',r.reviewer_name,'rating',r.rating,'title',r.review_title,'body',r.review_body,'status',r.status,'merchantReply',r.merchant_reply,'verifiedPurchase',EXISTS(SELECT 1 FROM saas.review_collection_requests x WHERE x.store_id=r.store_id AND x.review_id=r.id),'version',r.version,'createdAt',saas.catalog_admin_timestamp(r.created_at),'updatedAt',saas.catalog_admin_timestamp(r.updated_at))) FROM saas.product_reviews r JOIN saas.products p ON p.store_id=r.store_id AND p.id=r.product_id WHERE r.store_id=p_store_id AND r.id=p_id
$f$;
CREATE OR REPLACE FUNCTION saas.public_starter_review_projection(p_store_id uuid,p_review_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object('reviewerName',r.reviewer_name,'rating',r.rating,'title',r.review_title,'body',r.review_body,'merchantReply',CASE WHEN char_length(r.merchant_reply)<=1000 THEN r.merchant_reply END,'verifiedPurchase',EXISTS(SELECT 1 FROM saas.review_collection_requests x WHERE x.store_id=r.store_id AND x.review_id=r.id))) FROM saas.product_reviews r JOIN saas.products p ON p.store_id=r.store_id AND p.id=r.product_id AND p.status='active' WHERE r.store_id=p_store_id AND r.id=p_review_id AND r.status='approved' AND char_length(r.review_body)<=2000
$f$;
DO $f$ DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'review_collection_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver',r.identity);END LOOP;END $f$;
GRANT EXECUTE ON FUNCTION saas.review_collection_admin_overview(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.review_collection_admin_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.review_collection_public(text,timestamptz,text,text,uuid,text,jsonb) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.review_collection_work_claim(timestamptz,uuid),saas.review_collection_work_seal(uuid,uuid,timestamptz,text,jsonb),saas.review_collection_work_finish(uuid,uuid,timestamptz,text,text) TO celebix_saas_workflow;
COMMIT;
