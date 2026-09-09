-- Archive metadata is separate from immutable commerce history. No live apply authorized.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';

CREATE TABLE saas.order_archive_operations(
 store_id uuid NOT NULL,operation_id uuid NOT NULL,order_id uuid NOT NULL,
 principal_id uuid NOT NULL REFERENCES saas.principals(id),
 membership_id uuid NOT NULL REFERENCES saas.memberships(id),
 action text NOT NULL CHECK(action IN ('archive','restore')),
 reason text NOT NULL CHECK(reason=btrim(reason) AND length(reason) BETWEEN 1 AND 500 AND reason !~ '[[:cntrl:]]'),
 evidence_reference text NOT NULL CHECK(evidence_reference=btrim(evidence_reference) AND length(evidence_reference) BETWEEN 1 AND 500 AND evidence_reference !~ '[[:cntrl:]]'),
 changed_at timestamptz NOT NULL,
 result_payload jsonb NOT NULL,
 PRIMARY KEY(store_id,operation_id),
 UNIQUE(store_id,order_id,operation_id),
 FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT
);
CREATE TABLE saas.order_archive_state(
 store_id uuid NOT NULL,order_id uuid NOT NULL,archived boolean NOT NULL,
 operation_id uuid NOT NULL,changed_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,order_id),
 FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(store_id,order_id,operation_id) REFERENCES saas.order_archive_operations(store_id,order_id,operation_id) ON DELETE RESTRICT
);
ALTER TABLE saas.order_archive_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_archive_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_archive_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_archive_state FORCE ROW LEVEL SECURITY;
CREATE POLICY order_archive_operations_owner ON saas.order_archive_operations TO celebix_saas_owner USING(true) WITH CHECK(true);
CREATE POLICY order_archive_state_owner ON saas.order_archive_state TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.order_archive_operations,saas.order_archive_state FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
CREATE FUNCTION saas.order_archive_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $$
BEGIN RAISE EXCEPTION 'ORDER_ARCHIVE_AUDIT_IMMUTABLE'; END $$;
CREATE TRIGGER order_archive_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON saas.order_archive_operations
 FOR EACH STATEMENT EXECUTE FUNCTION saas.order_archive_audit_immutable();

-- Discover declared and conventional order dependencies, including future tables.
-- Unknown dependencies block rather than silently being classified as harmless.
CREATE FUNCTION saas.order_archive_dependencies()
RETURNS TABLE(relation oid, column_name name)
LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $$
 SELECT DISTINCT c.oid,a.attname
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE n.nspname='saas' AND c.relkind IN ('r','p')
 AND c.relname NOT IN ('orders','order_archive_state','order_archive_operations','order_items','order_events','order_notes','order_operations','order_drafts')
 AND (a.attname IN ('order_id','converted_order_id','recovered_order_id') OR EXISTS(
  SELECT 1 FROM pg_catalog.pg_constraint f JOIN LATERAL unnest(f.conkey,f.confkey) keys(local_key,foreign_key) ON true
  JOIN pg_catalog.pg_attribute parent ON parent.attrelid=f.confrelid AND parent.attnum=keys.foreign_key
  WHERE f.contype='f' AND f.conrelid=c.oid AND f.confrelid='saas.orders'::regclass
   AND keys.local_key=a.attnum AND parent.attname='id'))
 ORDER BY c.oid,a.attname
$$;

CREATE FUNCTION saas.order_archive_blockers(p_store_id uuid,p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $$
DECLARE selected saas.orders%ROWTYPE; dep record; present boolean; blockers jsonb:='[]';
BEGIN
 SELECT * INTO selected FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id;
 IF NOT FOUND THEN RETURN '["order_not_found"]'; END IF;
 IF selected.payment_status NOT IN ('pending','failed') THEN blockers:=blockers||'["payment_state"]'::jsonb; END IF;
 IF selected.status NOT IN ('pending','confirmed','cancelled') OR selected.tracking IS NOT NULL THEN blockers:=blockers||'["fulfillment_state"]'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM saas.order_drafts WHERE store_id=p_store_id AND converted_order_id=p_order_id AND adjust_inventory)
 OR EXISTS(SELECT 1 FROM saas.order_events WHERE store_id=p_store_id AND order_id=p_order_id AND payload->>'adjustedInventory'='true')
 THEN blockers:=blockers||'["inventory_history"]'::jsonb; END IF;
 FOR dep IN SELECT * FROM saas.order_archive_dependencies() LOOP
  IF dep.relation='saas.order_email_deliveries'::regclass THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1 AND (status NOT IN (''delivered'',''bounced'',''complained'',''suppressed'') OR lease_id IS NOT NULL))',dep.relation::regclass,dep.column_name) INTO present USING p_order_id;
  ELSE
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',dep.relation::regclass,dep.column_name) INTO present USING p_order_id;
  END IF;
  IF present THEN blockers:=blockers||jsonb_build_array('dependency_'||(SELECT relname::text FROM pg_catalog.pg_class WHERE oid=dep.relation)); END IF;
 END LOOP;
 RETURN blockers;
END $$;

CREATE FUNCTION saas.orders_archive_eligibility(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_order_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE denial text; blockers jsonb; archived_value boolean;
BEGIN
 denial:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
 IF denial IS NOT NULL THEN RETURN QUERY SELECT denial,NULL::jsonb; RETURN; END IF;
 IF p_order_id IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id) THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
 blockers:=saas.order_archive_blockers(p_store_id,p_order_id);
 SELECT archived INTO archived_value FROM saas.order_archive_state WHERE store_id=p_store_id AND order_id=p_order_id;
 RETURN QUERY SELECT 'found'::text,jsonb_build_object('id',p_order_id,'eligible',blockers='[]'::jsonb,'archived',coalesce(archived_value,false),'blockers',blockers);
END $$;

CREATE FUNCTION saas.orders_archive_change(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_order_id uuid,p_reason text,p_evidence_reference text,p_action text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
DECLARE denial text; existing saas.order_archive_operations%ROWTYPE; dep record; archived_value boolean; changed timestamptz; result jsonb;
BEGIN
 denial:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
 IF denial IS NOT NULL THEN RETURN QUERY SELECT denial,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_order_id IS NULL OR p_action IS NULL OR p_action NOT IN ('archive','restore')
 OR p_reason IS NULL OR p_reason<>btrim(p_reason) OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason~'[[:cntrl:]]'
 OR p_evidence_reference IS NULL OR p_evidence_reference<>btrim(p_evidence_reference) OR length(p_evidence_reference) NOT BETWEEN 1 AND 500 OR p_evidence_reference~'[[:cntrl:]]'
 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
 -- Consistent operation then order lock ordering prevents duplicate audit writes.
 PERFORM pg_advisory_xact_lock(hashtextextended('order_archive:'||p_store_id||':'||p_operation_id,0));
 SELECT * INTO existing FROM saas.order_archive_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
 IF FOUND THEN
  IF existing.order_id<>p_order_id OR existing.action<>p_action OR existing.reason<>p_reason OR existing.evidence_reference<>p_evidence_reference
   OR existing.principal_id<>p_principal_id OR existing.membership_id<>p_membership_id
  THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload||jsonb_build_object('replayed',true); END IF;
  RETURN;
 END IF;
 PERFORM 1 FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
 SELECT archived INTO archived_value FROM saas.order_archive_state WHERE store_id=p_store_id AND order_id=p_order_id;
 IF coalesce(archived_value,false)=(p_action='archive') THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;
 IF p_action='archive' THEN
  -- FK row locks alone do not cover conventional or indirect references.
  FOR dep IN SELECT DISTINCT relation FROM saas.order_archive_dependencies() ORDER BY relation LOOP
   EXECUTE format('LOCK TABLE %s IN SHARE MODE',dep.relation::regclass);
  END LOOP;
  IF saas.order_archive_blockers(p_store_id,p_order_id)<>'[]'::jsonb THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;
 END IF;
 changed:=date_trunc('milliseconds',clock_timestamp());
 result:=jsonb_build_object('id',p_order_id,'archived',p_action='archive','operationId',p_operation_id,'changedAt',saas.orders_cursor_timestamp(changed),'replayed',false);
 INSERT INTO saas.order_archive_operations(store_id,operation_id,order_id,principal_id,membership_id,action,reason,evidence_reference,changed_at,result_payload)
 VALUES(p_store_id,p_operation_id,p_order_id,p_principal_id,p_membership_id,p_action,p_reason,p_evidence_reference,changed,result);
 INSERT INTO saas.order_archive_state(store_id,order_id,archived,operation_id,changed_at)
 VALUES(p_store_id,p_order_id,p_action='archive',p_operation_id,changed)
 ON CONFLICT(store_id,order_id) DO UPDATE SET archived=EXCLUDED.archived,operation_id=EXCLUDED.operation_id,changed_at=EXCLUDED.changed_at;
 RETURN QUERY SELECT CASE WHEN p_action='archive' THEN 'archived' ELSE 'restored' END,result;
END $$;

CREATE FUNCTION saas.orders_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_order_id uuid,p_reason text,p_evidence_reference text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
 SELECT * FROM saas.orders_archive_change(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_order_id,p_reason,p_evidence_reference,'archive')
$$;

CREATE FUNCTION saas.orders_restore(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_order_id uuid,p_reason text,p_evidence_reference text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $$
 SELECT * FROM saas.orders_archive_change(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_order_id,p_reason,p_evidence_reference,'restore')
$$;
CREATE OR REPLACE FUNCTION saas.orders_list(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_status text, p_search text, p_sort text, p_page_size bigint,
  p_cursor_total_cents bigint, p_cursor_created_at timestamptz, p_cursor_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  page_items jsonb;
  has_more boolean;
  last_total_cents bigint;
  last_created_at timestamptz;
  last_id uuid;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR (p_status IS NOT NULL AND p_status <> ALL (ARRAY['pending','confirmed','preparing','shipped','delivered','cancelled','refunded']))
     OR p_sort IS NULL OR p_sort <> ALL (ARRAY['newest','oldest','highest','lowest'])
     OR (p_search IS NOT NULL AND (p_search <> pg_catalog.btrim(p_search) OR pg_catalog.char_length(p_search) NOT BETWEEN 1 AND 200 OR p_search ~ '[[:cntrl:]]'))
     OR (pg_catalog.num_nulls(p_cursor_total_cents,p_cursor_created_at,p_cursor_id) NOT IN (0,3))
     OR (p_cursor_total_cents IS NOT NULL AND p_cursor_total_cents < 0) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  WITH candidates AS (
    SELECT order_row.*
    FROM saas.orders AS order_row
    WHERE order_row.store_id=p_store_id
      AND NOT EXISTS(SELECT 1 FROM saas.order_archive_state a WHERE a.store_id=order_row.store_id AND a.order_id=order_row.id AND a.archived)
      AND (p_status IS NULL OR order_row.status=p_status)
      AND (p_search IS NULL OR pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',order_row.order_number,order_row.customer_name,order_row.customer_email,order_row.customer_phone)),pg_catalog.lower(p_search)) > 0)
      AND (
        p_cursor_created_at IS NULL
        OR (p_sort='newest' AND (order_row.created_at,order_row.id) < (p_cursor_created_at,p_cursor_id))
        OR (p_sort='oldest' AND (order_row.created_at,order_row.id) > (p_cursor_created_at,p_cursor_id))
        OR (p_sort='highest' AND (order_row.total_cents,order_row.created_at,order_row.id) < (p_cursor_total_cents,p_cursor_created_at,p_cursor_id))
        OR (p_sort='lowest' AND (order_row.total_cents,order_row.created_at,order_row.id) > (p_cursor_total_cents,p_cursor_created_at,p_cursor_id))
      )
    ORDER BY
      CASE WHEN p_sort='highest' THEN order_row.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN order_row.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN order_row.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN order_row.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN order_row.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN order_row.id END ASC
    LIMIT p_page_size+1
  ), page AS (
    SELECT candidates.*, pg_catalog.row_number() OVER (ORDER BY
      CASE WHEN p_sort='highest' THEN candidates.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN candidates.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.id END ASC
    ) AS page_position
    FROM candidates
    ORDER BY
      CASE WHEN p_sort='highest' THEN candidates.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN candidates.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.id END ASC
    LIMIT p_page_size
  )
  SELECT
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',page.id,'orderNumber',page.order_number,'source',page.source,
      'customerName',page.customer_name,'customerEmail',page.customer_email,
      'currency',page.currency,'totalCents',page.total_cents,'status',page.status,
      'paymentStatus',page.payment_status,
      'itemCount',(SELECT pg_catalog.count(*) FROM saas.order_items AS item WHERE item.store_id=p_store_id AND item.order_id=page.id),
      'createdAt',saas.orders_cursor_timestamp(page.created_at),'updatedAt',saas.orders_cursor_timestamp(page.updated_at),'version',page.version
    ) ORDER BY page.page_position),'[]'::jsonb),
    (SELECT pg_catalog.count(*) > p_page_size FROM candidates),
    (SELECT tail.total_cents FROM page AS tail WHERE tail.page_position=p_page_size),
    (SELECT tail.created_at FROM page AS tail WHERE tail.page_position=p_page_size),
    (SELECT tail.id FROM page AS tail WHERE tail.page_position=p_page_size)
  INTO page_items,has_more,last_total_cents,last_created_at,last_id
  FROM page;
  result_payload := pg_catalog.jsonb_build_object('items',page_items);
  IF has_more THEN
    result_payload := result_payload || pg_catalog.jsonb_build_object('nextCursor',pg_catalog.jsonb_build_object('totalCents',last_total_cents,'createdAt',saas.orders_cursor_timestamp(last_created_at),'id',last_id));
  END IF;
  RETURN QUERY SELECT 'listed'::text,result_payload;
END
$function$;

CREATE OR REPLACE FUNCTION saas.orders_list_archived(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_status text, p_search text, p_sort text, p_page_size bigint,
  p_cursor_total_cents bigint, p_cursor_created_at timestamptz, p_cursor_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  page_items jsonb;
  has_more boolean;
  last_total_cents bigint;
  last_created_at timestamptz;
  last_id uuid;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR (p_status IS NOT NULL AND p_status <> ALL (ARRAY['pending','confirmed','preparing','shipped','delivered','cancelled','refunded']))
     OR p_sort IS NULL OR p_sort <> ALL (ARRAY['newest','oldest','highest','lowest'])
     OR (p_search IS NOT NULL AND (p_search <> pg_catalog.btrim(p_search) OR pg_catalog.char_length(p_search) NOT BETWEEN 1 AND 200 OR p_search ~ '[[:cntrl:]]'))
     OR (pg_catalog.num_nulls(p_cursor_total_cents,p_cursor_created_at,p_cursor_id) NOT IN (0,3))
     OR (p_cursor_total_cents IS NOT NULL AND p_cursor_total_cents < 0) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  WITH candidates AS (
    SELECT order_row.*
    FROM saas.orders AS order_row
    WHERE order_row.store_id=p_store_id
      AND EXISTS(SELECT 1 FROM saas.order_archive_state a WHERE a.store_id=order_row.store_id AND a.order_id=order_row.id AND a.archived)
      AND (p_status IS NULL OR order_row.status=p_status)
      AND (p_search IS NULL OR pg_catalog.strpos(pg_catalog.lower(pg_catalog.concat_ws(' ',order_row.order_number,order_row.customer_name,order_row.customer_email,order_row.customer_phone)),pg_catalog.lower(p_search)) > 0)
      AND (
        p_cursor_created_at IS NULL
        OR (p_sort='newest' AND (order_row.created_at,order_row.id) < (p_cursor_created_at,p_cursor_id))
        OR (p_sort='oldest' AND (order_row.created_at,order_row.id) > (p_cursor_created_at,p_cursor_id))
        OR (p_sort='highest' AND (order_row.total_cents,order_row.created_at,order_row.id) < (p_cursor_total_cents,p_cursor_created_at,p_cursor_id))
        OR (p_sort='lowest' AND (order_row.total_cents,order_row.created_at,order_row.id) > (p_cursor_total_cents,p_cursor_created_at,p_cursor_id))
      )
    ORDER BY
      CASE WHEN p_sort='highest' THEN order_row.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN order_row.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN order_row.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN order_row.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN order_row.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN order_row.id END ASC
    LIMIT p_page_size+1
  ), page AS (
    SELECT candidates.*, pg_catalog.row_number() OVER (ORDER BY
      CASE WHEN p_sort='highest' THEN candidates.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN candidates.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.id END ASC
    ) AS page_position
    FROM candidates
    ORDER BY
      CASE WHEN p_sort='highest' THEN candidates.total_cents END DESC,
      CASE WHEN p_sort='lowest' THEN candidates.total_cents END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.created_at END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.created_at END ASC,
      CASE WHEN p_sort IN ('newest','highest') THEN candidates.id END DESC,
      CASE WHEN p_sort IN ('oldest','lowest') THEN candidates.id END ASC
    LIMIT p_page_size
  )
  SELECT
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',page.id,'orderNumber',page.order_number,'source',page.source,
      'customerName',page.customer_name,'customerEmail',page.customer_email,
      'currency',page.currency,'totalCents',page.total_cents,'status',page.status,
      'paymentStatus',page.payment_status,
      'itemCount',(SELECT pg_catalog.count(*) FROM saas.order_items AS item WHERE item.store_id=p_store_id AND item.order_id=page.id),
      'createdAt',saas.orders_cursor_timestamp(page.created_at),'updatedAt',saas.orders_cursor_timestamp(page.updated_at),'version',page.version
    ) ORDER BY page.page_position),'[]'::jsonb),
    (SELECT pg_catalog.count(*) > p_page_size FROM candidates),
    (SELECT tail.total_cents FROM page AS tail WHERE tail.page_position=p_page_size),
    (SELECT tail.created_at FROM page AS tail WHERE tail.page_position=p_page_size),
    (SELECT tail.id FROM page AS tail WHERE tail.page_position=p_page_size)
  INTO page_items,has_more,last_total_cents,last_created_at,last_id
  FROM page;
  result_payload := pg_catalog.jsonb_build_object('items',page_items);
  IF has_more THEN
    result_payload := result_payload || pg_catalog.jsonb_build_object('nextCursor',pg_catalog.jsonb_build_object('totalCents',last_total_cents,'createdAt',saas.orders_cursor_timestamp(last_created_at),'id',last_id));
  END IF;
  RETURN QUERY SELECT 'listed'::text,result_payload;
END
$function$;

-- Additive detail ABI: rolling back an older strict parser remains safe.
CREATE FUNCTION saas.orders_get_with_archive(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz, p_order_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_order_id IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.order_archive_state WHERE store_id=p_store_id AND order_id=p_order_id AND archived) THEN
    authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
    IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  END IF;
  result_payload := saas.orders_detail_projection(p_store_id,p_order_id);
  IF result_payload IS NULL THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  result_payload:=result_payload||coalesce((SELECT jsonb_build_object('archive',jsonb_build_object('archived',archived,'changedAt',saas.orders_cursor_timestamp(changed_at))) FROM saas.order_archive_state WHERE store_id=p_store_id AND order_id=p_order_id),'{}'::jsonb);
  RETURN QUERY SELECT 'found'::text,result_payload;
END
$function$;

CREATE OR REPLACE FUNCTION saas.orders_get_neighbors(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_order_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $order_neighbors$
DECLARE
  authority_error text;
  current_order saas.orders%ROWTYPE;
  previous_id uuid;
  previous_number text;
  next_id uuid;
  next_number text;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_now,'orders','orders.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  IF p_order_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;

  SELECT selected.*
    INTO current_order
  FROM saas.orders AS selected
  WHERE selected.store_id = p_store_id
    AND selected.id = p_order_id
    AND NOT EXISTS(SELECT 1 FROM saas.order_archive_state a WHERE a.store_id=selected.store_id AND a.order_id=selected.id AND a.archived);

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb;
    RETURN;
  END IF;

  SELECT candidate.id,candidate.order_number
    INTO previous_id,previous_number
  FROM saas.orders AS candidate
  WHERE candidate.store_id = p_store_id
    AND NOT EXISTS(SELECT 1 FROM saas.order_archive_state a WHERE a.store_id=candidate.store_id AND a.order_id=candidate.id AND a.archived)
    AND (candidate.created_at,candidate.id) > (current_order.created_at,current_order.id)
  ORDER BY candidate.created_at ASC,candidate.id ASC
  LIMIT 1;

  SELECT candidate.id,candidate.order_number
    INTO next_id,next_number
  FROM saas.orders AS candidate
  WHERE candidate.store_id = p_store_id
    AND NOT EXISTS(SELECT 1 FROM saas.order_archive_state a WHERE a.store_id=candidate.store_id AND a.order_id=candidate.id AND a.archived)
    AND (candidate.created_at,candidate.id) < (current_order.created_at,current_order.id)
  ORDER BY candidate.created_at DESC,candidate.id DESC
  LIMIT 1;

  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'previous',CASE WHEN previous_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'id',previous_id,'orderNumber',previous_number
    ) END,
    'next',CASE WHEN next_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'id',next_id,'orderNumber',next_number
    ) END
  ));
END
$order_neighbors$;


REVOKE ALL ON FUNCTION saas.order_archive_audit_immutable(),saas.order_archive_dependencies(),saas.order_archive_blockers(uuid,uuid),
 saas.orders_archive_change(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.orders_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.orders_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_restore(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.orders_restore(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_archive_eligibility(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.orders_archive_eligibility(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_get_with_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.orders_get_with_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.orders_list_archived(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.orders_list_archived(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
COMMIT;
