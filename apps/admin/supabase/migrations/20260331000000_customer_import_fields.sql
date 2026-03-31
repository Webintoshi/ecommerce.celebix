-- =====================================================
-- MIGRATION: Customer import compatibility fields
-- =====================================================

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS external_customer_id TEXT;

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS accepts_email_marketing BOOLEAN DEFAULT false;

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS accepts_sms_marketing BOOLEAN DEFAULT false;

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN DEFAULT false;

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

ALTER TABLE addresses
ADD COLUMN IF NOT EXISTS company TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_external_customer_id
ON customers(external_customer_id);

CREATE INDEX IF NOT EXISTS idx_customers_accepts_email_marketing
ON customers(accepts_email_marketing);

CREATE INDEX IF NOT EXISTS idx_customers_accepts_sms_marketing
ON customers(accepts_sms_marketing);
