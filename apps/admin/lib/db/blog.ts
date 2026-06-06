import { createServerClient, BlogPost } from "@/lib/supabase";
import { getSetting, setSetting } from "@/lib/db/settings";
import { slugify } from "@/lib/utils";

const BLOG_POSTS_SETTING_KEY = "blog_posts_registry";

type BlogRegistry = {
  posts?: unknown[];
};

type BlogQueryError = Error & {
  code?: string;
};

function createBlogQueryError(message: string, code?: string): BlogQueryError {
  const error = new Error(message) as BlogQueryError;
  if (code) {
    error.code = code;
  }

  return error;
}

function isBlogPostsTableUnsupported(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }

  const message = String(error.message ?? "");
  return (
    /Could not find the table 'public\.blog_posts' in the schema cache/i.test(message) ||
    /relation ["']public\.blog_posts["'] does not exist/i.test(message) ||
    /relation ["']blog_posts["'] does not exist/i.test(message) ||
    message.includes("light_postgres compatibility table destegi bulunamadi: blog_posts") ||
    message.includes("Insert desteklenmiyor: blog_posts") ||
    message.includes("Update desteklenmiyor: blog_posts") ||
    message.includes("Delete desteklenmiyor: blog_posts")
  );
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStatus(value: unknown): string {
  return value === "published" || value === "archived" || value === "draft"
    ? value
    : "draft";
}

function normalizeCreatedAt(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : new Date().toISOString();
}

function normalizePublishedAt(status: string, publishedAt: unknown, createdAt: string): string | null {
  if (status !== "published") {
    return typeof publishedAt === "string" && publishedAt.trim().length > 0
      ? publishedAt
      : null;
  }

  return typeof publishedAt === "string" && publishedAt.trim().length > 0
    ? publishedAt
    : createdAt;
}

function normalizeBlogPost(row: Partial<BlogPost>): BlogPost {
  const createdAt = normalizeCreatedAt(row.created_at);
  const status = normalizeStatus(row.status);

  return {
    id: typeof row.id === "string" && row.id ? row.id : crypto.randomUUID(),
    title: typeof row.title === "string" ? row.title : "",
    slug: typeof row.slug === "string" ? row.slug.trim() : "",
    content: normalizeOptionalText(row.content),
    excerpt: normalizeOptionalText(row.excerpt),
    featured_image: normalizeOptionalText(row.featured_image),
    author: normalizeOptionalText(row.author) ?? "Admin",
    status,
    published_at: normalizePublishedAt(status, row.published_at, createdAt),
    created_at: createdAt,
  };
}

function sortPostsByCreatedAt(posts: BlogPost[]) {
  return [...posts].sort(
    (left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

function sortPublishedPosts(posts: BlogPost[]) {
  return sortPostsByCreatedAt(posts)
    .filter((post) => post.status === "published")
    .sort((left, right) => {
      const leftDate = left.published_at || left.created_at;
      const rightDate = right.published_at || right.created_at;
      return new Date(rightDate).getTime() - new Date(leftDate).getTime();
    });
}

async function getStoredBlogPosts(): Promise<BlogPost[]> {
  const registry = (await getSetting(BLOG_POSTS_SETTING_KEY)) as BlogRegistry | null;
  const rawPosts = Array.isArray(registry?.posts) ? registry.posts : [];
  return sortPostsByCreatedAt(
    rawPosts.map((post) => normalizeBlogPost((post ?? {}) as Partial<BlogPost>)),
  );
}

async function saveStoredBlogPosts(posts: BlogPost[]) {
  await setSetting(BLOG_POSTS_SETTING_KEY, {
    posts: posts.map((post) => normalizeBlogPost(post)),
  } as Record<string, unknown>);
}

function tryDecodeSlug(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildAsciiSlug(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSlugCandidates(slug: string): string[] {
  const trimmed = slug.trim();
  const decoded = tryDecodeSlug(trimmed);

  return [
    trimmed,
    decoded,
    trimmed.normalize("NFC"),
    decoded.normalize("NFC"),
    slugify(decoded),
    buildAsciiSlug(decoded),
  ].filter((candidate, index, candidates) => candidate && candidates.indexOf(candidate) === index);
}

function ensureUniqueStoredSlug(posts: BlogPost[], slug: string, excludedId?: string) {
  const hasConflict = posts.some(
    (post) => post.slug === slug && post.id !== excludedId,
  );

  if (hasConflict) {
    throw createBlogQueryError("Bu slug zaten kullaniliyor.", "23505");
  }
}

function getStoredPostBySlug(posts: BlogPost[], slug: string): BlogPost | null {
  const candidates = buildSlugCandidates(slug);
  const publishedPosts = sortPublishedPosts(posts);

  for (const candidate of candidates) {
    const exactMatch = publishedPosts.find((post) => post.slug === candidate);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return null;
}

export async function getPublishedPosts() {
  const serverClient = createServerClient();
  const { data, error } = await serverClient
    .from("blog_posts")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    if (isBlogPostsTableUnsupported(error)) {
      return sortPublishedPosts(await getStoredBlogPosts());
    }
    throw error;
  }

  return data || [];
}

export async function getPostBySlug(slug: string) {
  const serverClient = createServerClient();
  const candidates = buildSlugCandidates(slug);
  const { data, error } = await serverClient
    .from("blog_posts")
    .select("*")
    .in("slug", candidates)
    .eq("status", "published")
    .limit(10);

  if (error) {
    if (isBlogPostsTableUnsupported(error)) {
      return getStoredPostBySlug(await getStoredBlogPosts(), slug);
    }
    return null;
  }

  if (!data?.length) {
    return null;
  }

  for (const candidate of candidates) {
    const exactMatch = data.find((row) => row.slug === candidate);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return data[0] ?? null;
}

export async function getAllPosts() {
  const serverClient = createServerClient();
  const { data, error } = await serverClient
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isBlogPostsTableUnsupported(error)) {
      return getStoredBlogPosts();
    }
    throw error;
  }

  return data || [];
}

export async function getPostById(id: string) {
  const serverClient = createServerClient();
  const { data, error } = await serverClient
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (isBlogPostsTableUnsupported(error)) {
      const storedPost = (await getStoredBlogPosts()).find((post) => post.id === id) ?? null;
      if (!storedPost) {
        throw createBlogQueryError("Row not found", "PGRST116");
      }
      return storedPost;
    }
    throw error;
  }

  return data;
}

export async function createPost(post: Omit<BlogPost, "id" | "created_at">) {
  const serverClient = createServerClient();
  const { data, error } = await serverClient
    .from("blog_posts")
    .insert(post)
    .select()
    .single();

  if (error) {
    if (!isBlogPostsTableUnsupported(error)) {
      throw error;
    }

    const posts = await getStoredBlogPosts();
    ensureUniqueStoredSlug(posts, String(post.slug || "").trim());

    const now = new Date().toISOString();
    const nextPost = normalizeBlogPost({
      ...post,
      id: crypto.randomUUID(),
      created_at: now,
      published_at:
        post.status === "published"
          ? post.published_at || now
          : null,
    });

    await saveStoredBlogPosts([nextPost, ...posts]);
    return nextPost;
  }

  return data;
}

export async function updatePost(id: string, updates: Partial<BlogPost>) {
  const serverClient = createServerClient();
  const { data, error } = await serverClient
    .from("blog_posts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (!isBlogPostsTableUnsupported(error)) {
      throw error;
    }

    const posts = await getStoredBlogPosts();
    const existingPost = posts.find((post) => post.id === id);
    if (!existingPost) {
      throw createBlogQueryError("Row not found", "PGRST116");
    }

    const nextSlug =
      typeof updates.slug === "string" && updates.slug.trim().length > 0
        ? updates.slug.trim()
        : existingPost.slug;
    ensureUniqueStoredSlug(posts, nextSlug, id);

    const nextPost = normalizeBlogPost({
      ...existingPost,
      ...updates,
      id,
      slug: nextSlug,
      created_at: existingPost.created_at,
    });

    await saveStoredBlogPosts(
      posts.map((post) => (post.id === id ? nextPost : post)),
    );

    return nextPost;
  }

  return data;
}

export async function publishPost(id: string) {
  const serverClient = createServerClient();
  const publishedAt = new Date().toISOString();
  const { data, error } = await serverClient
    .from("blog_posts")
    .update({
      status: "published",
      published_at: publishedAt,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (isBlogPostsTableUnsupported(error)) {
      return updatePost(id, {
        status: "published",
        published_at: publishedAt,
      });
    }
    throw error;
  }

  return data;
}

export async function unpublishPost(id: string) {
  const serverClient = createServerClient();
  const { data, error } = await serverClient
    .from("blog_posts")
    .update({ status: "draft", published_at: null })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (isBlogPostsTableUnsupported(error)) {
      return updatePost(id, { status: "draft", published_at: null });
    }
    throw error;
  }

  return data;
}

export async function deletePost(id: string) {
  const serverClient = createServerClient();
  const { error } = await serverClient
    .from("blog_posts")
    .delete()
    .eq("id", id);

  if (error) {
    if (!isBlogPostsTableUnsupported(error)) {
      throw error;
    }

    const posts = await getStoredBlogPosts();
    const nextPosts = posts.filter((post) => post.id !== id);
    if (nextPosts.length === posts.length) {
      throw createBlogQueryError("Row not found", "PGRST116");
    }

    await saveStoredBlogPosts(nextPosts);
  }

  return true;
}
