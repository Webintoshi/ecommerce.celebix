-- Settings table - public read/write
DROP POLICY IF EXISTS "Settings are viewable by everyone" ON settings;
CREATE POLICY "Settings are viewable by everyone" ON settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated can update settings" ON settings;
CREATE POLICY "Authenticated can update settings" ON settings FOR ALL USING (auth.role() = 'authenticated');

-- Also try with anon for public access
DROP POLICY IF EXISTS "Anyone can read settings" ON settings;
CREATE POLICY "Anyone can read settings" ON settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert settings" ON settings;
CREATE POLICY "Anyone can insert settings" ON settings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update settings" ON settings;
CREATE POLICY "Anyone can update settings" ON settings FOR UPDATE USING (true);
