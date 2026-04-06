"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BlogForm } from "@/components/admin/BlogForm";
import { fetchBlogPost } from "@/lib/blog-editor-client";
import type { BlogPost } from "@/types/blog";

export default function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPost() {
      try {
        setLoading(true);
        setError(null);
        const nextPost = await fetchBlogPost(id);
        if (mounted) setPost(nextPost);
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Yazi yuklenemedi.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadPost();

    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="mx-auto max-w-7xl">
        {loading && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Yazi yukleniyor...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <Link
              href="/admin/cms/blog"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Blog listesine don
            </Link>
          </div>
        )}

        {!loading && !error && !post && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Aradiginiz yazi bulunamadi.
          </div>
        )}

        {!loading && !error && post && <BlogForm initialData={post} />}
      </div>
    </div>
  );
}
