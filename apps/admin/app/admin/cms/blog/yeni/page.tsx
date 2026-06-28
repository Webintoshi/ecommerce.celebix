"use client";

import { BlogForm } from "@/components/admin/BlogForm";

export default function NewBlogPostPage() {
  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none px-4 sm:px-5 xl:px-6">
        <BlogForm />
      </div>
    </main>
  );
}
