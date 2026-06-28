"use client";

import { BlogForm } from "@/components/admin/BlogForm";

export default function NewBlogPostPage() {
  return (
    <div className="min-h-screen bg-[var(--admin-bg)] p-6 md:p-8">
      <BlogForm />
    </div>
  );
}
