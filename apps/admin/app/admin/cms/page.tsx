"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  ChevronRight,
  Plus,
  BarChart3,
  PenTool,
  Clock,
  Eye,
} from "lucide-react";
import { fetchBlogStrategySnapshot } from "@/lib/blog-strategy-client";
import { fetchCmsPages } from "@/lib/cms-pages";
import type { CmsPage } from "@/types/cms";
import type { BlogPost } from "@/types/blog";

export default function CmsDashboard() {
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [cmsPages, setCmsPages] = useState<CmsPage[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const [pages, blogSnapshot] = await Promise.all([
          fetchCmsPages(),
          fetchBlogStrategySnapshot(),
        ]);

        if (mounted) {
          setCmsPages(pages);
          setBlogPosts(blogSnapshot.posts);
        }
      } catch (error) {
        console.error("CMS dashboard load error:", error);
      }
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const stats = [
    { label: "Blog Yazıları", count: blogPosts.length, icon: PenTool, color: "text-purple-600", bg: "bg-purple-100" },
    { label: "Statik Sayfalar", count: cmsPages.length, icon: FileText, color: "text-blue-600", bg: "bg-blue-100" },
    {
      label: "Taslaklar",
      count: blogPosts.filter((post) => post.status === "draft").length + cmsPages.filter((page) => page.status === "draft").length,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      label: "Yayında",
      count:
        blogPosts.filter((post) => post.status === "published").length +
        cmsPages.filter((page) => page.status === "published").length,
      icon: Eye,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
  ];

  return (
    <div className="min-h-screen space-y-8 bg-gray-50/50 p-6 md:p-8">
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="rounded-lg border border-transparent p-2 transition-colors hover:border-gray-200 hover:bg-white"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">İçerik Yönetimi</h1>
          <p className="mt-1 text-sm text-gray-500">Blog yazılarını ve sayfalarınızı buradan yönetin.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{stat.label}</p>
              <p className="mt-0.5 text-2xl font-bold leading-tight text-gray-900">{stat.count}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
          <div className="p-6">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-200 transition-transform group-hover:scale-105">
                <PenTool className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Blog Yönetimi</h2>
                <p className="mt-0.5 text-sm text-gray-500">Haberler, duyurular ve SEO içerikleri.</p>
              </div>
            </div>

            <div className="mb-6 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-600">Toplam Yazı</span>
                <span className="font-bold text-gray-900">{blogPosts.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-600">İçerik Stratejisi</span>
                <span className="font-bold text-purple-600">Pillar-Cluster</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href="/admin/cms/blog"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-gray-800"
              >
                Görüntüle
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="/admin/cms/blog/yeni"
                className="rounded-xl bg-purple-100 px-4 py-3 text-purple-700 transition-all hover:bg-purple-200"
              >
                <Plus className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
          <div className="p-6">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200 transition-transform group-hover:scale-105">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Sayfa Yönetimi</h2>
                <p className="mt-0.5 text-sm text-gray-500">Hakkımızda, iletişim ve kurumsal sayfalar.</p>
              </div>
            </div>

            <div className="mb-6 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-600">Toplam Sayfa</span>
                <span className="font-bold text-gray-900">{cmsPages.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3">
                <span className="text-sm font-medium text-gray-600">Yayındaki Sayfa</span>
                <span className="font-bold text-emerald-600">
                  {cmsPages.filter((page) => page.status === "published").length}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href="/admin/cms/sayfalar"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-gray-800"
              >
                Görüntüle
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="/admin/cms/sayfalar/yeni"
                className="rounded-xl bg-blue-100 px-4 py-3 text-blue-700 transition-all hover:bg-blue-200"
              >
                <Plus className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-white">
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-xl">
            <h3 className="mb-2 flex items-center gap-2 text-xl font-bold">
              <BarChart3 className="h-5 w-5 text-purple-400" />
              İçerik Strateji İpucu
            </h3>
            <p className="text-sm leading-relaxed text-gray-300">
              Pillar-Cluster yapısını kullanarak blog yazılarınızı organize edin. Her pillar için 3-5 detaylı cluster
              yazısı oluşturun ve birbirine link verin. Bu SEO otoritenizi artırır.
            </p>
          </div>
          <Link
            href="/admin/cms/blog"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-gray-900 shadow-lg transition-all hover:bg-gray-100"
          >
            Stratejiyi Gör
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="absolute right-0 top-0 -mr-32 -mt-32 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-32 -ml-32 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
      </div>
    </div>
  );
}
