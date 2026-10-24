-- Authenticated product-page writing is separate from purchase-backed invitations.
-- Existing approved-review projections and all invitation routines remain unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.product-page-reviews.release274',0));
CREATE TABLE saas.product_page_review_settings(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT false,version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),updated_at timestamptz NOT NULL CHECK(isfinite(updated_at))
);
CREATE TABLE saas.product_page_review_submissions(
 store_id uuid NOT NULL,customer_id uuid NOT NULL,account_id uuid NOT NULL,product_id uuid NOT NULL,review_id uuid NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,customer_id,product_id),UNIQUE(store_id,review_id),
 FOREIGN KEY(store_id,customer_id)REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(store_id,account_id)REFERENCES saas.storefront_accounts(store_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(store_id,product_id)REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(store_id,review_id)REFERENCES saas.product_reviews(store_id,id) ON DELETE RESTRICT
);
CREATE TABLE saas.product_page_review_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN('settings','submit')),customer_id uuid,product_id uuid,
 fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),request_payload jsonb NOT NULL CHECK(jsonb_typeof(request_payload)='object'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object'),created_at timestamptz NOT NULL,
 CHECK((action='settings' AND customer_id IS NULL AND product_id IS NULL)OR(action='submit' AND customer_id IS NOT NULL AND product_id IS NOT NULL))
);
CREATE TABLE saas.product_page_review_limits(
 store_id uuid NOT NULL,customer_id uuid NOT NULL,bucket timestamptz NOT NULL,requests integer NOT NULL CHECK(requests BETWEEN 1 AND 5),
 PRIMARY KEY(store_id,customer_id,bucket),FOREIGN KEY(store_id,customer_id)REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT
);
DO $private$ DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['product_page_review_settings','product_page_review_submissions','product_page_review_operations','product_page_review_limits'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity',n);
 END LOOP;
END $private$;
-- Reuse the existing immutable receipt guard without changing its definition.
CREATE TRIGGER product_page_review_operations_immutable BEFORE UPDATE OR DELETE ON saas.product_page_review_operations FOR EACH ROW EXECUTE FUNCTION saas.review_collection_operation_immutable();
CREATE TRIGGER product_page_review_submissions_immutable BEFORE UPDATE OR DELETE ON saas.product_page_review_submissions FOR EACH ROW EXECUTE FUNCTION saas.review_collection_operation_immutable();
CREATE FUNCTION saas.product_page_review_admin_get(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;r jsonb;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_code,p_version,p_now,'catalog','catalog_admin.read');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 SELECT jsonb_build_object('enabled',s.enabled,'version',s.version)INTO r FROM saas.product_page_review_settings s WHERE s.store_id=p_store;
 RETURN QUERY SELECT 'found',coalesce(r,'{"enabled":false,"version":0}'::jsonb);
END $f$;
CREATE FUNCTION saas.product_page_review_admin_save(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text,p_expected_version bigint,p_enabled boolean)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.product_page_review_operations%ROWTYPE;s saas.product_page_review_settings%ROWTYPE;r jsonb;request jsonb;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_code,p_version,p_now,'catalog','catalog_admin.moderate');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_enabled IS NULL OR p_now IS NULL OR NOT isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('enabled',p_enabled,'expectedVersion',p_expected_version);
 PERFORM pg_advisory_xact_lock(hashtextextended('product-page-review.operation:'||p_operation::text,0));
 SELECT *INTO op FROM saas.product_page_review_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF(op.store_id,op.action,op.fingerprint,op.request_payload)IS DISTINCT FROM(p_store,'settings',p_fingerprint,request)THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload;END IF;RETURN;
 END IF;
 -- Submit holds the shared form of this same lock through its commit.
 PERFORM pg_advisory_xact_lock(hashtextextended('product-page-review.settings:'||p_store::text,0));
 SELECT *INTO s FROM saas.product_page_review_settings WHERE store_id=p_store FOR UPDATE;
 IF coalesce(s.version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.product_page_review_settings VALUES(p_store,p_enabled,1,p_now)
 ON CONFLICT(store_id)DO UPDATE SET enabled=EXCLUDED.enabled,version=saas.product_page_review_settings.version+1,updated_at=greatest(saas.product_page_review_settings.updated_at,p_now)
 RETURNING jsonb_build_object('enabled',enabled,'version',version)INTO r;
 INSERT INTO saas.product_page_review_operations VALUES(p_operation,p_store,'settings',NULL,NULL,p_fingerprint,request,r,p_now);
 RETURN QUERY SELECT 'saved',r;
END $f$;
CREATE FUNCTION saas.public_product_page_review_availability(p_hostname text,p_now timestamptz,p_product uuid,p_credentials jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;context record;customer uuid;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_product IS NULL OR NOT saas.storefront_credential_candidates_valid(p_credentials,true)THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.storefront_public_store(p_hostname,p_now);
 IF selected_store IS NULL THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.product_page_review_settings s WHERE s.store_id=selected_store AND s.enabled)
 OR NOT EXISTS(SELECT 1 FROM saas.products p WHERE p.store_id=selected_store AND p.id=p_product AND p.status='active')THEN RETURN QUERY SELECT 'found','{"enabled":false}'::jsonb;RETURN;END IF;
 SELECT *INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false);
 IF FOUND THEN
  SELECT c.id INTO customer FROM saas.storefront_accounts a JOIN saas.customers c ON c.store_id=a.store_id AND c.id=a.customer_id
  JOIN saas.storefront_account_sessions s ON s.store_id=a.store_id AND s.account_id=a.id
  WHERE a.store_id=selected_store AND a.id=context.account_id AND a.status='active' AND c.status='active' AND a.customer_id=context.customer_id
   AND s.id=context.session_id AND s.session_kind='full' AND s.revoked_at IS NULL AND s.created_at<=p_now AND s.idle_expires_at>p_now AND s.absolute_expires_at>p_now
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_credentials)candidate WHERE candidate->>'keyId'=s.key_id AND candidate->>'digest'=s.credential_digest);
 END IF;
 IF customer IS NULL THEN RETURN QUERY SELECT 'found','{"enabled":true,"state":"guest"}'::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.product_page_review_submissions x WHERE x.store_id=selected_store AND x.customer_id=customer AND x.product_id=p_product)
 OR EXISTS(SELECT 1 FROM saas.review_collection_requests x JOIN saas.orders o ON o.store_id=x.store_id AND o.id=x.order_id WHERE x.store_id=selected_store AND x.product_id=p_product AND x.review_id IS NOT NULL AND o.customer_id=customer)
 THEN RETURN QUERY SELECT 'found','{"enabled":true,"state":"submitted"}'::jsonb;ELSE RETURN QUERY SELECT 'found','{"enabled":true,"state":"available"}'::jsonb;END IF;
END $f$;
CREATE FUNCTION saas.public_product_page_review_submit(p_hostname text,p_now timestamptz,p_product uuid,p_credentials jsonb,p_operation uuid,p_fingerprint text,p_review jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;context record;account saas.storefront_accounts%ROWTYPE;customer saas.customers%ROWTYPE;op saas.product_page_review_operations%ROWTYPE;new_review uuid;day_bucket timestamptz;used integer;r jsonb:='{"status":"pending"}'::jsonb;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_product IS NULL OR p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
 OR NOT saas.storefront_credential_candidates_valid(p_credentials,true)THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.storefront_public_store(p_hostname,p_now);IF selected_store IS NULL THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 SELECT *INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false);
 IF NOT FOUND OR context.store_id IS DISTINCT FROM selected_store OR context.session_kind IS DISTINCT FROM 'full' OR context.customer_id IS NULL THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
 -- Serialize this account, recheck the session under its lock, and retain active
 -- identity locks through commit. Candidate digests never grant a customer ID.
 SELECT *INTO account FROM saas.storefront_accounts a WHERE a.store_id=selected_store AND a.id=context.account_id FOR UPDATE;
 IF NOT FOUND OR account.status<>'active' OR account.customer_id IS DISTINCT FROM context.customer_id THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
 PERFORM 1 FROM saas.storefront_account_sessions s WHERE s.store_id=selected_store AND s.id=context.session_id AND s.account_id=account.id
  AND s.session_kind='full' AND s.revoked_at IS NULL AND s.created_at<=p_now AND s.idle_expires_at>p_now AND s.absolute_expires_at>p_now
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_credentials)candidate WHERE candidate->>'keyId'=s.key_id AND candidate->>'digest'=s.credential_digest)FOR SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
 SELECT *INTO customer FROM saas.customers c WHERE c.store_id=selected_store AND c.id=account.customer_id AND c.status='active' FOR SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
 IF p_review IS NULL OR jsonb_typeof(p_review)<>'object' OR NOT saas.campaign_starter_exact_keys(p_review,ARRAY['reviewerName','rating','body']||CASE WHEN p_review?'title'THEN ARRAY['title']ELSE ARRAY[]::text[]END)
 OR NOT saas.campaign_starter_text_valid(p_review->'reviewerName',1,120) OR p_review->'rating'NOT IN('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb)
 OR NOT saas.campaign_starter_text_valid(p_review->'body',1,2000) OR(p_review?'title'AND NOT saas.campaign_starter_text_valid(p_review->'title',1,200))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('product-page-review.operation:'||p_operation::text,0));
 SELECT *INTO op FROM saas.product_page_review_operations WHERE operation_id=p_operation;
 IF FOUND THEN
  IF(op.store_id,op.action,op.customer_id,op.product_id,op.fingerprint,op.request_payload)IS DISTINCT FROM(selected_store,'submit',customer.id,p_product,p_fingerprint,p_review)THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload;END IF;RETURN;
 END IF;
 -- A receipt replay is acknowledgement only. Every fresh write must observe the
 -- current setting, including a merchant disable that was already in flight.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('product-page-review.settings:'||selected_store::text,0));
 IF NOT EXISTS(SELECT 1 FROM saas.product_page_review_settings s WHERE s.store_id=selected_store AND s.enabled)THEN RETURN QUERY SELECT 'disabled',NULL::jsonb;RETURN;END IF;
 PERFORM 1 FROM saas.products p WHERE p.store_id=selected_store AND p.id=p_product AND p.status='active' FOR SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 -- Customer identity is durable across session rotation. A completed invitation
 -- already attributed to this customer also closes the direct writing form.
 PERFORM pg_advisory_xact_lock(hashtextextended('product-page-review.customer:'||selected_store::text||':'||customer.id::text,0));
 IF EXISTS(SELECT 1 FROM saas.product_page_review_submissions x WHERE x.store_id=selected_store AND x.customer_id=customer.id AND x.product_id=p_product)
 OR EXISTS(SELECT 1 FROM saas.review_collection_requests x JOIN saas.orders o ON o.store_id=x.store_id AND o.id=x.order_id WHERE x.store_id=selected_store AND x.product_id=p_product AND x.review_id IS NOT NULL AND o.customer_id=customer.id)
 THEN RETURN QUERY SELECT 'already_submitted',NULL::jsonb;RETURN;END IF;
 day_bucket:=date_trunc('day',p_now AT TIME ZONE 'UTC')AT TIME ZONE 'UTC';
 SELECT requests INTO used FROM saas.product_page_review_limits WHERE store_id=selected_store AND customer_id=customer.id AND bucket=day_bucket FOR UPDATE;
 IF coalesce(used,0)>=5 THEN RETURN QUERY SELECT 'rate_limited',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.product_page_review_limits VALUES(selected_store,customer.id,day_bucket,1)ON CONFLICT(store_id,customer_id,bucket)DO UPDATE SET requests=saas.product_page_review_limits.requests+1;
 new_review:=gen_random_uuid();
 INSERT INTO saas.product_reviews(id,store_id,product_id,reviewer_name,rating,review_title,review_body,status,version,created_at,updated_at)
 VALUES(new_review,selected_store,p_product,p_review->>'reviewerName',(p_review->>'rating')::integer,p_review->>'title',p_review->>'body','pending',1,p_now,p_now);
 INSERT INTO saas.product_page_review_submissions VALUES(selected_store,customer.id,account.id,p_product,new_review,p_now);
 INSERT INTO saas.product_page_review_operations VALUES(p_operation,selected_store,'submit',customer.id,p_product,p_fingerprint,p_review,r,p_now);
 RETURN QUERY SELECT 'submitted',r;
END $f$;
REVOKE ALL ON FUNCTION saas.product_page_review_admin_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.product_page_review_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,boolean),saas.public_product_page_review_availability(text,timestamptz,uuid,jsonb),saas.public_product_page_review_submit(text,timestamptz,uuid,jsonb,uuid,text,jsonb)FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.product_page_review_admin_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.product_page_review_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,boolean)TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.public_product_page_review_availability(text,timestamptz,uuid,jsonb),saas.public_product_page_review_submit(text,timestamptz,uuid,jsonb,uuid,text,jsonb)TO celebix_saas_host_resolver;
COMMIT;
