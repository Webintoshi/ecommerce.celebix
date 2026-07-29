BEGIN;
SET LOCAL ROLE celebix_saas_owner;

INSERT INTO saas.store_domains(
  id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version
) VALUES(
  '11000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057',
  'hosted-a.example.com','custom_domain','active',true,'2026-07-27','2026-07-27','2026-07-27',1
);

ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=20
WHERE store_id='10000000-0000-4000-8000-000000000057'
  AND id='41000000-0000-4000-8000-000000000057';
ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;

INSERT INTO saas.inventory_locations(
  id,store_id,name,is_default,status,version,created_at,updated_at
) VALUES(
  '43000000-0000-4000-8000-000000000057','10000000-0000-4000-8000-000000000057',
  'Default',true,'active',1,'2026-07-27','2026-07-27'
);
INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at)
VALUES(
  '10000000-0000-4000-8000-000000000057','43000000-0000-4000-8000-000000000057',
  '41000000-0000-4000-8000-000000000057',20,1,'2026-07-27'
);
INSERT INTO saas.inventory_movements(
  id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,
  source_kind,source_id,occurred_at,created_at
) VALUES(
  saas.inventory_deterministic_uuid('inventory-opening-movement','10000000-0000-4000-8000-000000000057:41000000-0000-4000-8000-000000000057'),
  '10000000-0000-4000-8000-000000000057','43000000-0000-4000-8000-000000000057',
  '41000000-0000-4000-8000-000000000057','opening','in',20,'opening',
  '41000000-0000-4000-8000-000000000057','2026-07-27','2026-07-27'
);

ALTER TABLE saas.checkout_provider_configs DISABLE TRIGGER USER;
UPDATE saas.checkout_provider_configs
SET configuration_digest=repeat('7',64),version=version+1,updated_at='2026-07-27'
WHERE id='52000000-0000-4000-8000-000000000057';
ALTER TABLE saas.checkout_provider_configs ENABLE TRIGGER USER;

COMMIT;
