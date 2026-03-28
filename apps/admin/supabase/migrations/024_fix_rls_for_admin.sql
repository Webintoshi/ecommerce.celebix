-- =====================================================
-- FIX RLS - Allow service role and simplify auth check
-- =====================================================

-- Drop all existing policies
DROP POLICY IF EXISTS schemas_select_all ON product_customization_schemas;
DROP POLICY IF EXISTS schemas_insert_auth ON product_customization_schemas;
DROP POLICY IF EXISTS schemas_update_auth ON product_customization_schemas;
DROP POLICY IF EXISTS schemas_delete_auth ON product_customization_schemas;
DROP POLICY IF EXISTS steps_select_all ON product_customization_steps;
DROP POLICY IF EXISTS steps_insert_auth ON product_customization_steps;
DROP POLICY IF EXISTS steps_update_auth ON product_customization_steps;
DROP POLICY IF EXISTS steps_delete_auth ON product_customization_steps;
DROP POLICY IF EXISTS options_select_all ON product_customization_options;
DROP POLICY IF EXISTS options_insert_auth ON product_customization_options;
DROP POLICY IF EXISTS options_update_auth ON product_customization_options;
DROP POLICY IF EXISTS options_delete_auth ON product_customization_options;
DROP POLICY IF EXISTS schema_assignments_all ON product_schema_assignments;
DROP POLICY IF EXISTS category_assignments_all ON category_schema_assignments;
DROP POLICY IF EXISTS step_conditions_all ON product_step_conditions;
DROP POLICY IF EXISTS price_rules_all ON price_adjustment_rules;
DROP POLICY IF EXISTS snapshots_all ON product_customization_snapshots;

-- Create permissive policies (for development/admin use)
-- In production, restrict to specific roles or use service role

-- Schemas: Allow all operations (restrict in application layer)
CREATE POLICY schemas_all ON product_customization_schemas FOR ALL USING (true) WITH CHECK (true);

-- Steps: Allow all operations
CREATE POLICY steps_all ON product_customization_steps FOR ALL USING (true) WITH CHECK (true);

-- Options: Allow all operations
CREATE POLICY options_all ON product_customization_options FOR ALL USING (true) WITH CHECK (true);

-- Assignments: Allow all operations
CREATE POLICY schema_assignments_all ON product_schema_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY category_assignments_all ON category_schema_assignments FOR ALL USING (true) WITH CHECK (true);

-- Conditions: Allow all operations
CREATE POLICY step_conditions_all ON product_step_conditions FOR ALL USING (true) WITH CHECK (true);

-- Price rules: Allow all operations
CREATE POLICY price_rules_all ON price_adjustment_rules FOR ALL USING (true) WITH CHECK (true);

-- Snapshots: Allow all operations
CREATE POLICY snapshots_all ON product_customization_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Cart customizations: Keep user-specific (security needed)
DROP POLICY IF EXISTS cart_cust_user ON cart_item_customizations;
CREATE POLICY cart_cust_user ON cart_item_customizations FOR ALL USING (
    EXISTS (
        SELECT 1 FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.id
        WHERE ci.id = cart_item_customizations.cart_item_id
        AND (c.user_id = auth.uid() OR c.session_id = current_setting('app.current_session_id', true))
    )
);
