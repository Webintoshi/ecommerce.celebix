"use client";

import { fetchAdminJson } from "@/lib/admin-client-fetch";
import type { BlogStrategyApiResponse, BlogStrategySnapshot } from "@/types/blog-strategy";

export async function fetchBlogStrategySnapshot(): Promise<BlogStrategySnapshot> {
  const payload = await fetchAdminJson<BlogStrategyApiResponse>("/api/admin/blog-strategy");

  if (!payload.success || !payload.snapshot) {
    throw new Error(payload.error || "Blog stratejisi yuklenemedi.");
  }

  return {
    ...payload.snapshot,
    posts: payload.snapshot.posts.map((post) => ({
      ...post,
      publishedAt: new Date(post.publishedAt),
      updatedAt: new Date(post.updatedAt),
    })),
  };
}
