"use client";

import { fetchAdminJson } from "@/lib/admin-client-fetch";
import type { BlogPost } from "@/types/blog";

interface BlogPostApiResponse {
  success: boolean;
  post?: Omit<BlogPost, "publishedAt" | "updatedAt"> & {
    publishedAt: string;
    updatedAt: string;
  };
  error?: string;
}

export async function fetchBlogPost(id: string): Promise<BlogPost> {
  const payload = await fetchAdminJson<BlogPostApiResponse>(`/api/admin/blog-posts/${id}`);

  if (!payload.success || !payload.post) {
    throw new Error(payload.error || "Yazi yuklenemedi.");
  }

  return {
    ...payload.post,
    publishedAt: new Date(payload.post.publishedAt),
    updatedAt: new Date(payload.post.updatedAt),
  };
}
