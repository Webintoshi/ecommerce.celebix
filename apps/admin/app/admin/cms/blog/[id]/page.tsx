"use client";

import { BlogForm } from "@/components/admin/BlogForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function EditBlogPostPage({ params }: { params: { id: string } }) {
  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/cms/blog"
          className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Yazıyı Düzenle</h1>
          <p className="text-sm text-gray-500 mt-1">ID: {params.id}</p>
        </div>
      </div>
      <BlogForm />
    </div>
  );
}
