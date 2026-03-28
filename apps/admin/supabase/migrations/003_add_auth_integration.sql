-- =====================================================
-- MIGRATION: Add Auth Integration for Customers
-- =====================================================

-- Add user_id column to customers table (links to auth.users)
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create unique index on user_id (one customer per auth user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- Enable RLS on customers table
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own customer data" ON customers;
DROP POLICY IF EXISTS "Users can update own customer data" ON customers;
DROP POLICY IF EXISTS "Allow public insert for signup" ON customers;

-- Policy: Users can only see their own customer data
CREATE POLICY "Users can view own customer data"
  ON customers FOR SELECT
  USING (
    auth.uid() = user_id 
    OR 
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE auth.users.id = auth.uid() 
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Policy: Users can only update their own customer data
CREATE POLICY "Users can update own customer data"
  ON customers FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Allow inserts during signup (service role will handle this)
CREATE POLICY "Allow public insert for signup"
  ON customers FOR INSERT
  WITH CHECK (true);

-- =====================================================
-- TRIGGER: Create customer record when auth user is created
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_customer_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create if customer doesn't already exist for this email
  IF NOT EXISTS (SELECT 1 FROM public.customers WHERE email = NEW.email) THEN
    INSERT INTO public.customers (
      email, 
      first_name, 
      last_name, 
      phone, 
      user_id,
      status,
      total_orders,
      total_spent
    )
    VALUES (
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      NEW.id,
      'active',
      0,
      0
    );
  ELSE
    -- Update existing customer with user_id if email exists
    UPDATE public.customers 
    SET 
      user_id = NEW.id,
      first_name = COALESCE(NULLIF(public.customers.first_name, ''), NEW.raw_user_meta_data->>'first_name', ''),
      last_name = COALESCE(NULLIF(public.customers.last_name, ''), NEW.raw_user_meta_data->>'last_name', ''),
      phone = COALESCE(NULLIF(public.customers.phone, ''), NEW.raw_user_meta_data->>'phone', ''),
      updated_at = NOW()
    WHERE email = NEW.email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to auto-create customer on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_customer_on_signup();

-- =====================================================
-- TRIGGER: Update customer email when auth user email changes
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_customer_on_email_change()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.customers 
  SET 
    email = NEW.email,
    updated_at = NOW()
  WHERE user_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

-- Create trigger to update customer email on auth user update
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_customer_on_email_change();

-- =====================================================
-- NOTE: Supabase Dashboard Configuration Required
-- =====================================================
-- 
-- Please configure the following in Supabase Dashboard:
--
-- 1. Authentication > Email Templates:
--    - Confirm signup: Customize the email template
--    - Reset password: Customize the email template
--
-- 2. Authentication > URL Configuration:
--    - Site URL: https://your-store-domain.com
--    - Redirect URLs: 
--      - https://your-store-domain.com/**
--      - http://localhost:3000/**
--
-- 3. Authentication > Providers:
--    - Enable Email provider
--    - Confirm email: Enabled (recommended)
--
-- =====================================================
