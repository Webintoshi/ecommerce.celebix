-- Portable private schema metadata only, never customer/payment/order rows.
SELECT jsonb_build_object(
 'relations',(SELECT jsonb_object_agg(c.relname,jsonb_build_object(
  'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'roles',(SELECT jsonb_agg(pg_get_userbyid(r)ORDER BY pg_get_userbyid(r))FROM unnest(p.polroles)r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))ORDER BY p.polname),'[]'::jsonb)FROM pg_policy p WHERE p.polrelid=c.oid),
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',(SELECT pg_get_expr(d.adbin,d.adrelid)FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum))ORDER BY a.attnum)FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT coalesce(jsonb_object_agg(k.conname,jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)),'{}'::jsonb)FROM pg_constraint k WHERE k.conrelid=c.oid)))FROM pg_class c WHERE c.oid IN('saas.platform_checkout282_predecessors'::regclass,'saas.platform_tool_purchase_origins282'::regclass,'saas.platform_tool_purchase_releases282'::regclass)),
 'triggers',(SELECT jsonb_object_agg(t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text,'internal',t.tgisinternal))FROM pg_trigger t WHERE t.tgname IN('platform_tool_purchase_origins_immutable282','platform_tool_purchase_releases_immutable282'))
);
