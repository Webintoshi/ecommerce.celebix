SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
 ('20000000-0000-4000-8000-000000000186','https://id.test/oidc','gallery-owner','gallery-owner@test.invalid',true,'2026-01-01','2026-01-01'),
 ('20000000-0000-4000-8000-000000000187','https://id.test/oidc','gallery-analyst','gallery-analyst@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
 ('10000000-0000-4000-8000-000000000186','Gallery A','gallery-a','active','tr','TRY','starter','2026-01-01','2026-01-01'),
 ('10000000-0000-4000-8000-000000000187','Gallery B','gallery-b','active','tr','TRY','starter','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
 ('30000000-0000-4000-8000-000000000186','20000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','store_owner','active','2026-01-01','2026-01-01'),
 ('30000000-0000-4000-8000-000000000187','20000000-0000-4000-8000-000000000187','10000000-0000-4000-8000-000000000186','analyst','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
 ('70000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','00000000-0000-4000-8000-000000000001','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
 ('72000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','gallery-a.example.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES
 ('40000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','gallery-product','Gallery','active','TRY','2026-01-01','2026-01-01'),
 ('40000000-0000-4000-8000-000000000187','10000000-0000-4000-8000-000000000187','foreign-product','Foreign','active','TRY','2026-01-01','2026-01-01'),
 ('40000000-0000-4000-8000-000000000188','10000000-0000-4000-8000-000000000186','sibling-product','Sibling','active','TRY','2026-01-01','2026-01-01');
SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true);
SELECT set_config('saas.inventory.source_id','73000000-0000-4000-8000-000000000186',true);
SELECT set_config('saas.inventory.source_time','2026-10-01',true);
INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at) VALUES
 ('50000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','Red S',1000,false,0,'active','{"color":"Red","size":"S"}','2026-01-01','2026-01-01'),
 ('50000000-0000-4000-8000-000000000187','40000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','Red M',1000,false,0,'active','{"color":"Red","size":"M"}','2026-01-01','2026-01-01'),
 ('50000000-0000-4000-8000-000000000188','40000000-0000-4000-8000-000000000188','10000000-0000-4000-8000-000000000186','Sibling',1000,false,0,'active','{}','2026-01-01','2026-01-01');
INSERT INTO saas.product_media(id,store_id,product_id,variant_id,object_key,public_url,media_type,alt_text,byte_size,sort_order,status,created_at,updated_at)
 SELECT ('60000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186',CASE WHEN g=16 THEN '50000000-0000-4000-8000-000000000186'::uuid END,
 'stores/10000000-0000-4000-8000-000000000186/products/40000000-0000-4000-8000-000000000186/60000000-0000-4000-8000-'||lpad(g::text,12,'0')||'.webp',
 'https://media.example/stores/10000000-0000-4000-8000-000000000186/products/40000000-0000-4000-8000-000000000186/60000000-0000-4000-8000-'||lpad(g::text,12,'0')||'.webp','image/webp','',100,g-1,'active','2026-01-01','2026-01-01' FROM generate_series(1,16) g;
INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at) VALUES('90000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','active',1,'2026-10-02','2026-10-01','2026-10-01');
INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at) VALUES('90000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','test',repeat('c',64),'2026-10-02');
INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at) VALUES('90000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186','50000000-0000-4000-8000-000000000187',1,1000,0,'2026-10-01','2026-10-01');
INSERT INTO saas.storefront_checkout_intents(id,store_id,kind,status,key_id,credential_digest,product_id,variant_id,quantity,unit_price_cents,expires_at,created_at) VALUES('90000000-0000-4000-8000-000000000187','10000000-0000-4000-8000-000000000186','buy_now','active','test',repeat('d',64),'40000000-0000-4000-8000-000000000186','50000000-0000-4000-8000-000000000187',1,1000,'2026-10-02','2026-10-01');
INSERT INTO saas.payment_methods(id,store_id,kind,label,state,position,config,created_at,updated_at) VALUES('13000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','bank_transfer','Banka havalesi','active',10,'{"accountHolder":"Celebix","bankName":"Test Bank","iban":"TR330006100519786457841326","instructions":"Açıklamaya sipariş numarası yazın."}','2026-01-01','2026-01-01');
INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES('14000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','shipping_setting','Standart kargo','{"regions":["TR"],"estimatedDays":3,"shippingPriceCents":0}','active','2026-01-01','2026-01-01');
INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES('91000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','ORD-GALLERY-186','storefront','Ada','ada@example.test','TRY',1000,0,0,1000,'pending','pending','{}',1,'2026-10-01','2026-10-01');
INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES('92000000-0000-4000-8000-000000000186','10000000-0000-4000-8000-000000000186','91000000-0000-4000-8000-000000000186','40000000-0000-4000-8000-000000000186','50000000-0000-4000-8000-000000000187',0,'Gallery','Red M',1000,1,0,1000,'2026-10-01');
