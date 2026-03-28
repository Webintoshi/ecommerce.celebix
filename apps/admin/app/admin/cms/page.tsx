"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, FileText, ChevronRight, Plus, BarChart3, PenTool, Clock, Eye } from "lucide-react";
import { getBlogPosts } from "@/lib/blog";
import { getCmsPages } from "@/lib/cms";

export default function CmsDashboard() {
  const blogPosts = getBlogPosts();
  const cmsPages = getCmsPages();

  const stats = [
    { label: "Blog Yazıları", count: blogPosts.length, icon: PenTool, color: "text-purple-600", bg: "bg-purple-100" },
    { label: "Statik Sayfalar", count: cmsPages.length, icon: FileText, color: "text-blue-600", bg: "bg-blue-100" },
    {
      label: "Taslaklar",
      count: blogPosts.filter((p) => p.status === "draft").length + cmsPages.filter((p) => p.status === "draft").length,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      label: "Yayında",
      count:
        blogPosts.filter((p) => p.status === "published").length + cmsPages.filter((p) => p.status === "published").length,
      icon: Eye,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">İçerik Yönetimi</h1>
          <p className="text-sm text-gray-500 mt-1">Blog yazılarını ve sayfalarınızı buradan yönetin.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-xl flex items-center justify-center`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{stat.count}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-purple-200 group-hover:scale-105 transition-transform">
                <PenTool className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Blog Yönetimi</h2>
                <p className="text-sm text-gray-500 mt-0.5">Haberler, duyurular ve SEO içerikleri.</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-sm font-medium text-gray-600">Toplam Yazı</span>
                <span className="font-bold text-gray-900">{blogPosts.length}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-sm font-medium text-gray-600">İçerik Stratejisi</span>
                <span className="font-bold text-purple-600">Pillar-Cluster</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href="/admin/cms/blog"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all"
              >
                Görüntüle
                <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                href="/admin/cms/blog/yeni"
                className="px-4 py-3 bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 transition-all"
              >
                <Plus className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 group-hover:scale-105 transition-transform">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Sayfa Yönetimi</h2>
                <p className="text-sm text-gray-500 mt-0.5">Hakkımızda, İletişim ve kurumsal sayfalar.</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-sm font-medium text-gray-600">Toplam Sayfa</span>
                <span className="font-bold text-gray-900">{cmsPages.length}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-sm font-medium text-gray-600">SEO Puanı (Ort.)</span>
                <span className="font-bold text-emerald-600">%94</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href="/admin/cms/sayfalar"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all"
              >
                Görüntüle
                <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                href="/admin/cms/sayfalar/yeni"
                className="px-4 py-3 bg-blue-100 text-blue-700 rounded-xl hover:bg-blue-200 transition-all"
              >
                <Plus className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              İçerik Strateji İpucu
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              Pillar-Cluster yapısını kullanarak blog yazılarınızı organize edin. Her pillar için 3-5 detaylı
              cluster yazısı oluşturun ve birbirine link verin. Bu SEO otoritenizi artırır.
            </p>
          </div>
          <Link
            href="/admin/cms/blog"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 rounded-xl font-bold text-sm hover:bg-gray-100 transition-all shadow-lg"
          >
            Stratejiyi Gör
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full -ml-32 -mb-32 blur-3xl"></div>
      </div>
    </div>
  );
}
