-- =====================================================
-- FIX RLS POLICIES - Add INSERT/UPDATE/DELETE for admin
-- =====================================================

-- Drop existing policies to recreate
DROP POLICY IF EXISTS read_schemas ON product_customization_schemas;
DROP POLICY IF EXISTS read_schema_assignments ON product_schema_assignments;
DROP POLICY IF EXISTS read_category_assignments ON category_schema_assignments;
DROP POLICY IF EXISTS read_steps ON product_customization_steps;
DROP POLICY IF EXISTS read_options ON product_customization_options;
DROP POLICY IF EXISTS read_conditions ON product_step_conditions;
DROP POLICY IF EXISTS read_price_rules ON price_adjustment_rules;
DROP POLICY IF EXISTS read_snapshots ON product_customization_snapshots;

-- =====================================================
-- PRODUCT_CUSTOMIZATION_SCHEMAS
-- =====================================================
-- Allow all to read (for public product pages)
CREATE POLICY schemas_select_all ON product_customization_schemas FOR SELECT USING (true);

-- Allow authenticated users to create (admin check in app layer)
CREATE POLICY schemas_insert_auth ON product_customization_schemas FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Allow owner or any authenticated to update
CREATE POLICY schemas_update_auth ON product_customization_schemas FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY schemas_delete_auth ON product_customization_schemas FOR DELETE USING (auth.uid() IS NOT NULL);

-- =====================================================
-- PRODUCT_CUSTOMIZATION_STEPS
-- =====================================================
CREATE POLICY steps_select_all ON product_customization_steps FOR SELECT USING (true);
CREATE POLICY steps_insert_auth ON product_customization_steps FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY steps_update_auth ON product_customization_steps FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY steps_delete_auth ON product_customization_steps FOR DELETE USING (auth.uid() IS NOT NULL);

-- =====================================================
-- PRODUCT_CUSTOMIZATION_OPTIONS
-- =====================================================
CREATE POLICY options_select_all ON product_customization_options FOR SELECT USING (true);
CREATE POLICY options_insert_auth ON product_customization_options FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY options_update_auth ON product_customization_options FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY options_delete_auth ON product_customization_options FOR DELETE USING (auth.uid() IS NOT NULL);

-- =====================================================
-- OTHER TABLES
-- =====================================================
CREATE POLICY schema_assignments_all ON product_schema_assignments FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY category_assignments_all ON category_schema_assignments FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY step_conditions_all ON product_step_conditions FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY price_rules_all ON price_adjustment_rules FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY snapshots_all ON product_customization_snapshots FOR ALL USING (auth.uid() IS NOT NULL);
