-- Run ONLY on the root-created isolated copy. All merchant mutations roll back.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $qa$
DECLARE selected record; selected_now timestamptz:=statement_timestamp(); choices jsonb;
 workspace jsonb; candidate jsonb; saved record; published record; public_home record; actual jsonb;
BEGIN
 IF current_database()<>'celebix_design_qa_20260926' THEN RAISE EXCEPTION 'QA_CLONE_ONLY'; END IF;
 SELECT store.id store_id,member.principal_id,member.id membership_id,subscription.plan_id,subscription.plan_code,subscription.plan_version,domain.hostname
 INTO STRICT selected FROM saas.stores store
 JOIN saas.memberships member ON member.store_id=store.id AND member.role='store_owner' AND member.status='active'
 JOIN saas.subscriptions subscription ON subscription.store_id=store.id AND subscription.status='active'
 JOIN saas.store_domains domain ON domain.store_id=store.id AND domain.status='active' AND domain.is_primary
 WHERE store.slug='butik-siora' ORDER BY member.created_at,subscription.created_at DESC LIMIT 1;
 SELECT jsonb_agg(id ORDER BY ordinal) INTO choices FROM (
   SELECT product.id,row_number() OVER(ORDER BY product.id DESC) ordinal
   FROM saas.products product WHERE product.store_id=selected.store_id AND product.status='active'
     AND (saas.public_effective_product_projection(selected.store_id,product.id,selected_now)->>'available')::boolean
   ORDER BY product.id DESC LIMIT 2
 ) products;
 IF jsonb_array_length(choices)<>2 THEN RAISE EXCEPTION 'QA_NEEDS_TWO_AVAILABLE_PRODUCTS'; END IF;
 workspace:=saas.storefront_design_workspace_payload(selected.store_id);
 candidate:=jsonb_set(workspace->'draft',ARRAY['hero','enabled'],'false'::jsonb,false);
 candidate:=jsonb_set(candidate,ARRAY['composition','sections'],jsonb_build_array(jsonb_build_object(
   'sectionId','home_qa_manual_165','kind','product_row','enabled',true,'heading','İzole prova','source','manual','productIds',choices,'limit',12)),false);
 EXECUTE 'SET LOCAL ROLE celebix_saas_app';
 SELECT * INTO saved FROM saas.storefront_design_save_draft(selected.store_id,selected.principal_id,selected.membership_id,selected.plan_id,selected.plan_code,selected.plan_version,selected_now,gen_random_uuid(),repeat('a',64),(workspace->>'draftVersion')::bigint,candidate);
 IF saved.outcome<>'saved' THEN RAISE EXCEPTION 'QA_SAVE_OUTCOME_%',saved.outcome; END IF;
 SELECT * INTO published FROM saas.storefront_design_publish(selected.store_id,selected.principal_id,selected.membership_id,selected.plan_id,selected.plan_code,selected.plan_version,selected_now,gen_random_uuid(),repeat('b',64),(saved.result_payload->>'draftVersion')::bigint,(workspace->>'publishedVersion')::bigint);
 IF published.outcome<>'published' THEN RAISE EXCEPTION 'QA_PUBLISH_OUTCOME_%',published.outcome; END IF;
 EXECUTE 'SET LOCAL ROLE celebix_saas_host_resolver';
 SELECT * INTO public_home FROM saas.public_starter_retail_home(selected.store_id,selected.hostname,selected_now);
 IF public_home.outcome<>'found' THEN RAISE EXCEPTION 'QA_HOME_OUTCOME_%',public_home.outcome; END IF;
 SELECT jsonb_agg(item->>'id' ORDER BY ordinal) INTO actual FROM jsonb_array_elements(public_home.result_payload->'productRows'->0->'items') WITH ORDINALITY products(item,ordinal);
 IF actual<>choices THEN RAISE EXCEPTION 'QA_MANUAL_ORDER_MISMATCH'; END IF;
 RAISE NOTICE 'QA_CLONE_REAL_AUTHORITY_SAVE_PUBLISH_MANUAL_ORDER_PASS';
END $qa$;
ROLLBACK;
