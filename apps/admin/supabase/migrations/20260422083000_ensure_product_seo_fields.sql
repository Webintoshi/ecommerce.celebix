alter table public.products
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists seo_keywords text[],
  add column if not exists seo_focus_keyword text,
  add column if not exists canonical_url text,
  add column if not exists seo_robots text default 'index,follow',
  add column if not exists og_image text;
