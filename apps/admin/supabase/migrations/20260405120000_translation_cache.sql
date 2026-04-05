create table if not exists public.translation_cache (
  cache_key text primary key,
  provider text not null default 'deepl',
  source_locale text not null,
  target_locale text not null,
  context_text text not null default 'general',
  content_format text not null default 'text',
  source_text text not null,
  translated_text text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists translation_cache_target_locale_idx
  on public.translation_cache (target_locale);

create index if not exists translation_cache_context_idx
  on public.translation_cache (context_text);

