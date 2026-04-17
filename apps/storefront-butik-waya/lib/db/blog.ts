import { createServerClient, BlogPost } from "@/lib/supabase";
import { slugify } from "@/lib/utils";

// =====================================================
// BLOG QUERIES
// =====================================================

/**
 * Get published blog posts
 */
export async function getPublishedPosts() {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("blog_posts")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false });

    if (error) throw error;
    return data;
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
    const decoded = tryDecodeSlug(slug.trim());
    return [...new Set([
        slug.trim(),
        decoded,
        slug.trim().normalize("NFC"),
        decoded.normalize("NFC"),
        slugify(decoded),
        buildAsciiSlug(decoded),
    ].filter(Boolean))];
}

/**
 * Get blog post by slug
 */
export async function getPostBySlug(slug: string) {
    const serverClient = createServerClient();
    const candidates = buildSlugCandidates(slug);
    const { data, error } = await serverClient
        .from("blog_posts")
        .select("*")
        .in("slug", candidates)
        .eq("status", "published")
        .limit(10);

    if (error || !data?.length) return null;

    for (const candidate of candidates) {
        const exactMatch = data.find((row) => row.slug === candidate);
        if (exactMatch) {
            return exactMatch;
        }
    }

    return data[0] ?? null;
}

/**
 * Get all posts (admin)
 */
export async function getAllPosts() {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
}

/**
 * Get post by ID (admin)
 */
export async function getPostById(id: string) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("blog_posts")
        .select("*")
        .eq("id", id)
        .single();

    if (error) throw error;
    return data;
}

// =====================================================
// ADMIN BLOG MUTATIONS
// =====================================================

/**
 * Create blog post (admin)
 */
export async function createPost(post: Omit<BlogPost, "id" | "created_at">) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("blog_posts")
        .insert(post)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update blog post (admin)
 */
export async function updatePost(id: string, updates: Partial<BlogPost>) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("blog_posts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Publish blog post (admin)
 */
export async function publishPost(id: string) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("blog_posts")
        .update({
            status: "published",
            published_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Unpublish blog post (admin)
 */
export async function unpublishPost(id: string) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("blog_posts")
        .update({ status: "draft" })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete blog post (admin)
 */
export async function deletePost(id: string) {
    const serverClient = createServerClient();
    const { error } = await serverClient
        .from("blog_posts")
        .delete()
        .eq("id", id);

    if (error) throw error;
    return true;
}
