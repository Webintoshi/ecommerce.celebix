import { supabase, createServerClient, BlogPost } from "@/lib/supabase";

// =====================================================
// BLOG QUERIES
// =====================================================

/**
 * Get published blog posts
 */
export async function getPublishedPosts() {
    const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false });

    if (error) throw error;
    return data;
}

/**
 * Get blog post by slug
 */
export async function getPostBySlug(slug: string) {
    const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .single();

    if (error) return null;
    return data;
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
