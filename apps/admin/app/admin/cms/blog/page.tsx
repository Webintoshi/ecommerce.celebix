"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  Calendar,
  Tag,
  Target,
  LayoutGrid,
  List,
  ChevronRight,
  FileText,
  CheckCircle2,
  Circle,
  TrendingUp,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { getBlogPosts, BLOG_CATEGORIES, SUGGESTED_PILLARS, getContentProgress, CONTENT_GUIDELINES } from "@/lib/blog";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import type { BlogPost, TopicType } from "@/types/blog";

export default function BlogListingPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "strategy">("list");
  const posts = getBlogPosts();

  const filteredPosts = posts.filter((post) => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || post.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const progress = getContentProgress();

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/cms"
            className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Blog Yazıları</h1>
            <p className="text-sm text-gray-500 mt-1">İçeriklerinizi yönetin ve stratejinizi oluşturun.</p>
          </div>
        </div>
        <Link
          href="/admin/cms/blog/yeni"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Yeni Yazı Ekle
        </Link>
      </div>

      <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg flex-shrink-0">
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "list" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <List className="w-4 h-4" />
            Liste
          </button>
          <button
            onClick={() => setViewMode("strategy")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === "strategy" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Target className="w-4 h-4" />
            Strateji
          </button>
        </div>

        <div className="flex-1" />

        {viewMode === "list" && (
          <>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Yazılarda ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all bg-white text-sm"
              >
                <option value="all">Tüm Kategoriler</option>
                {BLOG_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {viewMode === "list" ? <ListView posts={filteredPosts} /> : <StrategyView posts={posts} progress={progress} />}
    </div>
  );
}

function ListView({ posts }: { posts: BlogPost[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Yazı</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tip</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kategori</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">SEO</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tarih</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {posts.map((post) => (
              <tr key={post.id} className="hover:bg-gray-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:block w-12 h-12 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
                      {post.coverImage ? (
                        <img src={post.coverImage} alt={post.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <FileText className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 leading-tight group-hover:text-gray-900 transition-colors">
                        {post.title}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" /> {post.views}
                        </span>
                        {post.wordCount > 0 && (
                          <>
                            <span className="text-gray-300">|</span>
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" /> {post.wordCount} kelime
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <TopicTypeBadge type={post.topicType} />
                </td>
                <td className="px-6 py-4">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium">
                    <Tag className="w-3 h-3" />
                    {BLOG_CATEGORIES.find((c) => c.id === post.category)?.name || post.category}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <SEOScoreBadge score={post.seoScore} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 opacity-50" />
                    {format(post.publishedAt, "d MMM yyyy", { locale: tr })}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/cms/blog/${post.id}`}
                      className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                      title="Düzenle"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <button
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Henüz yazı bulunmuyor</h3>
                  <p className="text-gray-500 mb-4">İlk blog yazınızı oluşturarak başlayın.</p>
                  <Link
                    href="/admin/cms/blog/yeni"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Yeni Yazı Ekle
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StrategyView({
  posts,
  progress,
}: {
  posts: BlogPost[];
  progress: { pillar: { total: number; target: number }; cluster: { total: number; target: number }; standalone: { total: number } };
}) {
  const pillars = posts.filter((p) => p.topicType === "pillar");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Target className="w-6 h-6 text-purple-600" />
            </div>
            <span className="text-3xl font-bold text-gray-900">{progress.pillar.total}</span>
          </div>
          <div className="text-sm font-medium text-gray-900">Pillar (Ana Konu)</div>
          <div className="text-xs text-gray-500 mt-1">Hedef: {progress.pillar.target}</div>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-purple-500 rounded-full h-2 transition-all"
              style={{ width: `${Math.min((progress.pillar.total / progress.pillar.target) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <LayoutGrid className="w-6 h-6 text-blue-600" />
            </div>
            <span className="text-3xl font-bold text-gray-900">{progress.cluster.total}</span>
          </div>
          <div className="text-sm font-medium text-gray-900">Cluster (Alt Konu)</div>
          <div className="text-xs text-gray-500 mt-1">Hedef: {progress.cluster.target}</div>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-500 rounded-full h-2 transition-all"
              style={{ width: `${Math.min((progress.cluster.total / progress.cluster.target) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-emerald-600" />
            </div>
            <span className="text-3xl font-bold text-gray-900">{progress.standalone.total}</span>
          </div>
          <div className="text-sm font-medium text-gray-900">Bağımsız Yazı</div>
          <div className="text-xs text-gray-500 mt-1">Blog yazıları</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              Önerilen Pillar Konuları
            </h2>
            <p className="text-sm text-gray-500 mt-1">Bu konularda pillar yazıları oluşturarak SEO otoritesi kurun</p>
          </div>
          <Link
            href="/admin/cms/blog/yeni?type=pillar"
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Pillar Oluştur
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {SUGGESTED_PILLARS.map((pillar) => {
            const existingPillar = posts.find((p) => p.topicType === "pillar" && p.slug === pillar.id);
            const clusters = existingPillar
              ? posts.filter((p) => p.topicType === "cluster" && p.pillarId === existingPillar.id)
              : [];

            return (
              <div
                key={pillar.id}
                className={`border-2 rounded-xl p-5 transition-all ${
                  existingPillar
                    ? "border-emerald-200 bg-emerald-50/30"
                    : "border-gray-200 hover:border-purple-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{pillar.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{pillar.description}</p>
                  </div>
                  {existingPillar ? (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium">
                      Oluşturuldu
                    </span>
                  ) : (
                    <Link
                      href={`/admin/cms/blog/yeni?type=pillar&pillarId=${pillar.id}&title=${encodeURIComponent(
                        pillar.title
                      )}`}
                      className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-medium transition-colors"
                    >
                      Oluştur
                    </Link>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {pillar.targetKeywords.map((kw) => (
                    <span key={kw} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      {kw}
                    </span>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Önerilen Cluster Yazıları</div>
                  {pillar.suggestedClusters.slice(0, 3).map((clusterTitle, idx) => {
                    const existingCluster = clusters.find((c) => c.title === clusterTitle);
                    return (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 text-sm ${
                          existingCluster ? "text-emerald-600" : "text-gray-600"
                        }`}
                      >
                        {existingCluster ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Circle className="w-4 h-4 text-gray-300" />
                        )}
                        <span className={existingCluster ? "line-through opacity-60" : ""}>{clusterTitle}</span>
                      </div>
                    );
                  })}
                  {pillar.suggestedClusters.length > 3 && (
                    <div className="text-xs text-gray-400 pl-6">+{pillar.suggestedClusters.length - 3} yazı daha</div>
                  )}
                </div>

                {existingPillar && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600">İlerleme</span>
                      <span className="font-medium text-gray-900">
                        {clusters.length} / {pillar.suggestedClusters.length}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-emerald-500 rounded-full h-2 transition-all"
                        style={{
                          width: `${Math.min((clusters.length / pillar.suggestedClusters.length) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    {clusters.length < pillar.suggestedClusters.length && (
                      <Link
                        href={`/admin/cms/blog/yeni?type=cluster&pillarId=${existingPillar.id}`}
                        className="inline-flex items-center gap-1 mt-3 text-sm text-gray-900 hover:text-gray-700 font-medium"
                      >
                        Cluster ekle
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            İçerik Kalitesi Rehberi
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-2xl font-bold text-purple-400 mb-1">{CONTENT_GUIDELINES.pillar.minWords}+</div>
              <div className="text-sm text-gray-300">Pillar için minimum kelime</div>
              <div className="text-xs text-gray-400 mt-1">Kapsamlı ana konu rehberi</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400 mb-1">{CONTENT_GUIDELINES.cluster.minWords}+</div>
              <div className="text-sm text-gray-300">Cluster için minimum kelime</div>
              <div className="text-xs text-gray-400 mt-1">Detaylı alt konu</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-400 mb-1">3-5</div>
              <div className="text-sm text-gray-300">Her pillar için cluster</div>
              <div className="text-xs text-gray-400 mt-1">İdeal içerik yapısı</div>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full -ml-32 -mb-32 blur-3xl"></div>
      </div>
    </div>
  );
}

function TopicTypeBadge({ type }: { type: TopicType }) {
  const styles = {
    pillar: "bg-purple-100 text-purple-700 border-purple-200",
    cluster: "bg-blue-100 text-blue-700 border-blue-200",
    standalone: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const labels = {
    pillar: "Pillar",
    cluster: "Cluster",
    standalone: "Yazı",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

function SEOScoreBadge({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm">
          {score}
        </div>
      </div>
    );
  } else if (score >= 60) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-sm">
          {score}
        </div>
      </div>
    );
  } else {
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-bold text-sm">
          {score || "-"}
        </div>
      </div>
    );
  }
}
