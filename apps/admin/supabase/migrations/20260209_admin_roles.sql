-- =====================================================
-- ADMIN ROLES & PROFILES
-- Run this in Supabase SQL Editor
-- =====================================================
-- Create allowed roles enum
CREATE TYPE user_role AS ENUM (
    'super_admin',
    'product_manager',
    'content_creator',
    'order_manager'
);
-- Create profiles table linked to auth.users
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role user_role DEFAULT 'product_manager',
    task_definition TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- Policies
-- Super admins can view and edit all profiles
CREATE POLICY "Super admins can manage all profiles" ON profiles FOR ALL USING (
    auth.uid() IN (
        SELECT id
        FROM profiles
        WHERE role = 'super_admin'
    )
) WITH CHECK (
    auth.uid() IN (
        SELECT id
        FROM profiles
        WHERE role = 'super_admin'
    )
);
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR
SELECT USING (auth.uid() = id);
-- Service role has full access
CREATE POLICY "Service role has full access to profiles" ON profiles FOR ALL USING (auth.role() = 'service_role');
-- Trigger to handle updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE
UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Create a function to handle new user creation (optional, but good for auto-profile creation if using public signups, 
-- but here we use manual creation via API, so we might insert directly)
-- However, we need to ensure the FIRST user (Super Admin) exists. 
-- You might need to manually update your own user's role in the DB after running this.