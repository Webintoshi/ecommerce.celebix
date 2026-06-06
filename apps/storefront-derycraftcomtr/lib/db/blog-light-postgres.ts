import "server-only";

import type { BlogPost } from "@/lib/supabase";
import { queryLightPostgres, withLightPostgresTransaction } from "@/lib/db/light-postgres-client";
import { shouldUseLightPostgresStorefront } from "@/lib/db/storefront-database-mode";

type LightPostgresBlogRow = {
  [key: string]: unknown;
  id: string;
  title: string;
  slug: string;
  content: string | null;
  excerpt: string | null;
  featured_image: string | null;
  author: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
};

type BlogAssetSnapshot = {
  primaryCategoryImage: string | null;
  secondaryCategoryImage: string | null;
  primaryProductImage: string | null;
};

type BlogAssetRow = {
  image: string | null;
};

const BLOG_POST_SELECT = `
  select
    id,
    title,
    slug,
    content,
    excerpt,
    featured_image,
    author,
    status,
    published_at,
    created_at
  from public.blog_posts
`;

const CREATE_BLOG_POSTS_TABLE_SQL = `
  create table if not exists public.blog_posts (
    id uuid primary key,
    title text not null,
    slug text unique not null,
    content text,
    excerpt text,
    featured_image text,
    author text,
    status text default 'draft',
    published_at timestamptz,
    created_at timestamptz default now()
  )
`;

const CREATE_BLOG_POSTS_INDEXES_SQL = [
  "create index if not exists idx_blog_posts_slug on public.blog_posts(slug)",
  "create index if not exists idx_blog_posts_status on public.blog_posts(status)",
] as const;

let blogParityReadyPromise: Promise<void> | null = null;

function normalizeImagePath(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "/placeholder.svg";
}

function buildDerycraftBlogPosts(assets: BlogAssetSnapshot): BlogPost[] {
  return [
    {
      id: "7e8f8fd7-5ba9-4e2d-b6f0-d61ff685f6f0",
      title: "DeryCraft 2 vitrini nasil konumlanir",
      slug: "starter-vitrin-nasil-konumlanir",
      excerpt:
        "Starter storefront theme uzerinde kategori, urun ve vitrin bloklarini nasil hizli sekilde kurabileceginizi anlatiyor.",
      content:
        "Bu yazi, Celebix starter theme uzerinde marka omurgasini nasil hizli kurdugumuzu gosteren ornek bir blog icerigidir.",
      featured_image: normalizeImagePath(assets.primaryCategoryImage),
      author: "Celebix Studio",
      status: "published",
      published_at: "2026-06-06T01:01:00.000Z",
      created_at: "2026-06-06T01:01:00.000Z",
    },
    {
      id: "8a3f7c1d-041f-4455-992e-f2a3f93dc8d2",
      title: "Premium PDP kurgusu icin gerekli bloklar",
      slug: "premium-pdp-kurgusu-icin-gerekli-bloklar",
      excerpt:
        "Urun gorselleri, yorumlar, swatchlar ve kisisellestirme alanlari birarada nasil calisir.",
      content:
        "Bu demo blog yazisi, yeni magaza projelerinde kullanilan PDP omurgasini aciklamak icin eklendi.",
      featured_image: normalizeImagePath(assets.primaryProductImage),
      author: "Celebix Studio",
      status: "published",
      published_at: "2026-06-06T01:00:00.000Z",
      created_at: "2026-06-06T01:00:00.000Z",
    },
    {
      id: "5d0fbe4a-2f4b-4da6-b1f7-88a748ca3b90",
      title: "Owner panelden tek tikla magaza hazirlama",
      slug: "owner-panelden-tek-tikla-magaza-hazirlama",
      excerpt:
        "Provisioning, starter seed ve storefront deploy zincirini daha okunur anlatan bir ornek icerik.",
      content:
        "Bu yazi, owner panel otomasyonu ile yeni bir magazayi nasil hazirlayabileceginizi gosteren starter iceriktir.",
      featured_image: normalizeImagePath(assets.secondaryCategoryImage),
      author: "Celebix Studio",
      status: "published",
      published_at: "2026-06-06T00:59:00.000Z",
      created_at: "2026-06-06T00:59:00.000Z",
    },
  ];
}

async function loadBlogAssets(client: {
  query: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: TRow[] }>;
}): Promise<BlogAssetSnapshot> {
  const [categoryResult, productResult] = await Promise.all([
    client.query<BlogAssetRow>(
      `
        select image
        from public.categories
        order by sort_order asc, id asc
        limit 2
      `,
    ),
    client.query<BlogAssetRow>(
      `
        select case
          when array_length(images, 1) > 0 then images[1]
          else null
        end as image
        from public.products
        where coalesce(is_active, true) = true
          and (status = 'published' or status is null)
        order by created_at asc, id asc
        limit 1
      `,
    ),
  ]);

  return {
    primaryCategoryImage: categoryResult.rows[0]?.image ?? null,
    secondaryCategoryImage: categoryResult.rows[1]?.image ?? categoryResult.rows[0]?.image ?? null,
    primaryProductImage: productResult.rows[0]?.image ?? null,
  };
}

async function seedDerycraftBlogPosts() {
  await withLightPostgresTransaction(async (client) => {
    await client.query(CREATE_BLOG_POSTS_TABLE_SQL);

    for (const statement of CREATE_BLOG_POSTS_INDEXES_SQL) {
      await client.query(statement);
    }

    const assets = await loadBlogAssets(client);
    const posts = buildDerycraftBlogPosts(assets);

    for (const post of posts) {
      await client.query(
        `
          insert into public.blog_posts (
            id,
            title,
            slug,
            content,
            excerpt,
            featured_image,
            author,
            status,
            published_at,
            created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
          on conflict (slug) do update
          set
            title = excluded.title,
            content = excluded.content,
            excerpt = excluded.excerpt,
            featured_image = excluded.featured_image,
            author = excluded.author,
            status = excluded.status,
            published_at = coalesce(public.blog_posts.published_at, excluded.published_at),
            created_at = coalesce(public.blog_posts.created_at, excluded.created_at)
        `,
        [
          post.id,
          post.title,
          post.slug,
          post.content,
          post.excerpt,
          post.featured_image,
          post.author,
          post.status,
          post.published_at,
          post.created_at,
        ],
      );
    }
  });
}

async function ensureDerycraftBlogPostsReady() {
  if (!shouldUseLightPostgresStorefront()) {
    return;
  }

  if (!blogParityReadyPromise) {
    blogParityReadyPromise = seedDerycraftBlogPosts().catch((error) => {
      blogParityReadyPromise = null;
      throw error;
    });
  }

  await blogParityReadyPromise;
}

export async function maybeListPublishedLightPostgresBlogPosts() {
  if (!shouldUseLightPostgresStorefront()) {
    return undefined;
  }

  await ensureDerycraftBlogPostsReady();

  return queryLightPostgres<LightPostgresBlogRow>(
    `
      ${BLOG_POST_SELECT}
      where status = 'published'
      order by published_at desc nulls last, created_at desc, id desc
    `,
  );
}

export async function maybeGetLightPostgresBlogPostBySlug(slugCandidates: readonly string[]) {
  if (!shouldUseLightPostgresStorefront()) {
    return undefined;
  }

  await ensureDerycraftBlogPostsReady();

  if (slugCandidates.length === 0) {
    return null;
  }

  const rows = await queryLightPostgres<LightPostgresBlogRow>(
    `
      ${BLOG_POST_SELECT}
      where status = 'published'
        and slug = any($1::text[])
      order by published_at desc nulls last, created_at desc, id desc
      limit 10
    `,
    [slugCandidates],
  );

  for (const candidate of slugCandidates) {
    const exactMatch = rows.find((row) => row.slug === candidate);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return rows[0] ?? null;
}
