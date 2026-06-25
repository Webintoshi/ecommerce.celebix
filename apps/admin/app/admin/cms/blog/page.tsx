"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  FileEdit,
  FileText,
  Filter,
  LayoutGrid,
  Lightbulb,
  List,
  Loader2,
  Plus,
  Search,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { fetchBlogStrategySnapshot } from "@/lib/blog-strategy-client";
import type { BlogPost, TopicType } from "@/types/blog";
import type {
  BlogStrategyCategory,
  BlogStrategyPillar,
  BlogStrategySnapshot,
} from "@/types/blog-strategy";

const EMPTY_PROGRESS = {
  pillar: { total: 0, target: 0 },
  cluster: { total: 0, target: 0 },
  standalone: { total: 0 },
};

type NoticeState = {
  tone: "success" | "error";
  text: string;
};

export default function BlogListingPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "strategy">("list");
  const [snapshot, setSnapshot] = useState<BlogStrategySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextSnapshot = await fetchBlogStrategySnapshot();
      setSnapshot(nextSnapshot);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Blog stratejisi yüklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const posts = snapshot?.posts || [];
  const categories = snapshot?.categories || [];
  const suggestedPillars = snapshot?.suggestedPillars || [];
  const progress = snapshot?.progress || EMPTY_PROGRESS;

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const needle = searchTerm.trim().toLocaleLowerCase("tr-TR");
      const matchesSearch =
        needle.length === 0 ||
        post.title.toLocaleLowerCase("tr-TR").includes(needle) ||
        post.excerpt.toLocaleLowerCase("tr-TR").includes(needle) ||
        post.primaryKeyword.toLocaleLowerCase("tr-TR").includes(needle);
      const matchesCategory =
        selectedCategory === "all" || post.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [posts, searchTerm, selectedCategory]);

  const handleDeletePost = useCallback(
    async (post: BlogPost) => {
      if (!window.confirm(`"${post.title}" yazısını silmek istediğinize emin misiniz?`)) {
        return;
      }

      setDeletingPostId(post.id);
      setNotice(null);

      try {
        await fetchAdminJson<{ success: boolean }>(`/api/admin/blog-posts/${post.id}`, {
          timeoutMs: 12000,
          init: {
            method: "DELETE",
          },
        });

        await loadSnapshot();
        setNotice({ tone: "success", text: "Yazı silindi." });
      } catch (deleteError) {
        setNotice({
          tone: "error",
          text:
            deleteError instanceof Error
              ? deleteError.message
              : "Yazı silinirken bir sorun oluştu.",
        });
      } finally {
        setDeletingPostId(null);
      }
    },
    [loadSnapshot],
  );

  return (
    <div className="admin-page-root p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-stone-200/80 bg-white/85 p-6 shadow-[0_24px_70px_-34px_rgba(120,78,33,0.45)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                  Blog yönetimi
                </span>
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                  Blog İçerikleri
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <HeaderMetric label="Toplam yazı" value={posts.length} />
              <HeaderMetric label="Pillar ekseni" value={progress.pillar.total} />
              <Link
                href="/admin/cms/blog/yeni"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800"
              >
                <Plus className="h-4 w-4" />
                Yeni yazı ekle
              </Link>
            </div>
          </div>
        </section>

        {notice ? (
          <section
            className={`rounded-[22px] border px-5 py-4 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.35)] ${
              notice.tone === "success"
                ? "border-emerald-200 bg-emerald-50/90 text-emerald-800"
                : "border-rose-200 bg-rose-50/90 text-rose-700"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border ${
                  notice.tone === "success"
                    ? "border-emerald-200 bg-white text-emerald-700"
                    : "border-rose-200 bg-white text-rose-600"
                }`}
              >
                {notice.tone === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <TriangleAlert className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {notice.tone === "success" ? "İşlem tamamlandı" : "Bir sorun oluştu"}
                </p>
                <p className="mt-1 text-sm leading-6">{notice.text}</p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[26px] border border-stone-200/80 bg-white/90 p-3 shadow-[0_20px_50px_-34px_rgba(120,78,33,0.45)]">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex flex-wrap items-center gap-2 rounded-full bg-stone-100 p-1.5">
              <ViewModeButton
                active={viewMode === "list"}
                icon={<List className="h-4 w-4" />}
                label="Liste"
                onClick={() => setViewMode("list")}
              />
              <ViewModeButton
                active={viewMode === "strategy"}
                icon={<Target className="h-4 w-4" />}
                label="Strateji"
                onClick={() => setViewMode("strategy")}
              />
            </div>

            {viewMode === "list" ? (
              <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_260px_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Yazılarda ara..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full rounded-full border border-stone-200 bg-stone-50/70 py-3 pl-11 pr-4 text-sm text-stone-700 outline-none transition focus:border-amber-300 focus:bg-white"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-full border border-stone-200 bg-stone-50/70 px-4 py-3 text-sm text-stone-600">
                  <Filter className="h-4 w-4 text-stone-400" />
                  <select
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    className="w-full bg-transparent text-sm text-stone-700 outline-none"
                  >
                    <option value="all">Tüm kategoriler</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-center justify-center rounded-full border border-stone-200 bg-[#FCFDFE] px-4 py-3 text-sm font-medium text-stone-600">
                  {filteredPosts.length} kayıt gösteriliyor
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-end rounded-full border border-stone-200 bg-[#FCFDFE] px-4 py-3 text-sm font-medium text-stone-600">
                {suggestedPillars.length} strateji ekseni hazırlandı
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : viewMode === "list" ? (
          <ListView
            posts={filteredPosts}
            categories={categories}
            totalPosts={posts.length}
            deletingPostId={deletingPostId}
            onDelete={handleDeletePost}
          />
        ) : (
          <StrategyView
            suggestedPillars={suggestedPillars}
            progress={progress}
            storeContext={snapshot?.storeContext}
            guidelines={snapshot?.contentGuidelines}
          />
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="rounded-[26px] border border-stone-200/80 bg-white/90 p-12 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.45)]">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-stone-900">Blog stratejisi yükleniyor</h2>
      </div>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="rounded-[26px] border border-rose-200 bg-rose-50/90 p-12 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.35)]">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600">
          <TriangleAlert className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-stone-900">Blog stratejisi yüklenemedi</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-stone-600">{message}</p>
      </div>
    </section>
  );
}

function ListView({
  posts,
  categories,
  totalPosts,
  deletingPostId,
  onDelete,
}: {
  posts: BlogPost[];
  categories: BlogStrategyCategory[];
  totalPosts: number;
  deletingPostId: string | null;
  onDelete: (post: BlogPost) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-stone-200/80 bg-white/92 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.45)]">
      <div className="flex flex-col gap-3 border-b border-stone-100 bg-[#FCFDFE] px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            İçerik listesi
          </div>
          <h2 className="mt-3 text-lg font-semibold text-stone-900">Yazılar</h2>
        </div>
        <div className="text-sm text-stone-600">
          Toplam {totalPosts} yazı içinden {posts.length} kayıt gösteriliyor.
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/70">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Yazı
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Tip
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Kategori
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                SEO
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Tarih
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                Aksiyonlar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {posts.map((post) => (
              <tr key={post.id} className="transition-colors hover:bg-amber-50/30">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="hidden h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 sm:block">
                      {post.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.coverImage} alt={post.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-stone-400">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                        {post.wordCount} kelime
                      </div>
                      <Link
                        href={`/admin/cms/blog/${post.id}`}
                        className="mt-3 block text-base font-semibold leading-6 text-stone-900 transition-colors hover:text-amber-800"
                      >
                        {post.title}
                      </Link>
                      <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 text-stone-600">
                        {post.excerpt}
                      </p>
                      <div className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                        Ana anahtar kelime: {post.primaryKeyword}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5 align-top">
                  <TopicTypeBadge type={post.topicType} />
                </td>
                <td className="px-6 py-5 align-top">
                  <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                    {categories.find((category) => category.id === post.category)?.name || post.category}
                  </span>
                </td>
                <td className="px-6 py-5 align-top">
                  <SeoScoreBadge score={post.seoScore} />
                </td>
                <td className="px-6 py-5 align-top text-sm text-stone-600">
                  <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5">
                    <Calendar className="h-3.5 w-3.5 opacity-60" />
                    {format(post.publishedAt, "d MMM yyyy", { locale: tr })}
                  </div>
                </td>
                <td className="px-6 py-5 align-top">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/cms/blog/${post.id}`}
                      className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-amber-300 hover:text-stone-900"
                    >
                      <FileEdit className="h-4 w-4" />
                      Düzenle
                    </Link>
                    <button
                      type="button"
                      onClick={() => void onDelete(post)}
                      disabled={deletingPostId === post.id}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-wait disabled:opacity-70"
                    >
                      {deletingPostId === post.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {posts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-stone-200 bg-stone-100 text-stone-400">
                    <FileText className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-stone-900">Henüz yazı bulunmuyor</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    İlk blog yazınızı oluşturarak içerik planını başlatın.
                  </p>
                  <Link
                    href="/admin/cms/blog/yeni"
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800"
                  >
                    <Plus className="h-4 w-4" />
                    Yeni yazı ekle
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StrategyView({
  suggestedPillars,
  progress,
  storeContext,
  guidelines,
}: {
  suggestedPillars: BlogStrategyPillar[];
  progress: BlogStrategySnapshot["progress"];
  storeContext?: BlogStrategySnapshot["storeContext"];
  guidelines?: BlogStrategySnapshot["contentGuidelines"];
}) {
  const safeGuidelines =
    guidelines ||
    ({
      pillar: { minWords: 1200, idealWords: 1800, description: "" },
      cluster: { minWords: 800, idealWords: 1200, description: "" },
      standalone: { minWords: 700, idealWords: 1000, description: "" },
    } as BlogStrategySnapshot["contentGuidelines"]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StrategyMetricCard
          icon={<Target className="h-5 w-5 text-amber-700" />}
          label="Pillar"
          total={progress.pillar.total}
          target={progress.pillar.target}
          accentClass="border-amber-200 bg-amber-50"
          progressColor="bg-amber-500"
        />
        <StrategyMetricCard
          icon={<LayoutGrid className="h-5 w-5 text-orange-700" />}
          label="Cluster"
          total={progress.cluster.total}
          target={progress.cluster.target}
          accentClass="border-orange-200 bg-orange-50"
          progressColor="bg-orange-500"
        />
        <StrategyMetricCard
          icon={<FileText className="h-5 w-5 text-stone-700" />}
          label="Bağımsız yazı"
          total={progress.standalone.total}
          accentClass="border-stone-200 bg-stone-100"
          progressColor="bg-stone-500"
        />
      </div>

      <section className="rounded-[26px] border border-stone-200/80 bg-white/92 p-6 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.45)] md:p-7">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
              Strateji eksenleri
            </div>
            <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold text-stone-900">
              <Lightbulb className="h-5 w-5 text-amber-600" />
              Dinamik pillar stratejisi
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {storeContext
                ? `${storeContext.totalCategories} kategori ve ${storeContext.totalProducts} ürün taranarak mağazaya özel içerik ekseni çıkarıldı.`
                : "Mağaza kategorileri ve ürünleri taranarak öneri üretildi."}
            </p>
          </div>

          <Link
            href="/admin/cms/blog/yeni"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            <Plus className="h-4 w-4" />
            Bu eksende yazı oluştur
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {suggestedPillars.map((pillar) => (
            <article
              key={pillar.id}
              className={`rounded-[24px] border p-5 transition-all ${
                pillar.existingPillarPostId
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-stone-200 bg-[#FCFDFE] hover:border-amber-300"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {pillar.productCount} ürün
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-stone-900">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{pillar.description}</p>
                </div>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                    pillar.existingPillarPostId
                      ? "border-emerald-200 bg-white text-emerald-700"
                      : "border-stone-200 bg-white text-stone-600"
                  }`}
                >
                  {pillar.existingPillarPostId ? "Pillar hazır" : "Pillar bekliyor"}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {pillar.targetKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
                  >
                    {keyword}
                  </span>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-stone-200 bg-white/70 p-4">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Önerilen cluster yazıları
                </div>
                <div className="space-y-2.5">
                  {pillar.suggestedClusters.map((clusterTitle) => {
                    const reached =
                      pillar.existingClusterCount > 0 &&
                      pillar.suggestedClusters.indexOf(clusterTitle) < pillar.existingClusterCount;

                    return (
                      <div
                        key={clusterTitle}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${
                          reached
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-stone-50 text-stone-600"
                        }`}
                      >
                        {reached ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-stone-300" />
                        )}
                        <span className={reached ? "line-through opacity-70" : ""}>{clusterTitle}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 border-t border-stone-200 pt-5">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-stone-600">İlerleme</span>
                  <span className="font-semibold text-stone-900">
                    {pillar.existingClusterCount} / {pillar.suggestedClusters.length}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                    style={{
                      width: `${Math.min(
                        (pillar.existingClusterCount / Math.max(pillar.suggestedClusters.length, 1)) * 100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
                <Link
                  href="/admin/cms/blog/yeni"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-stone-900 transition-colors hover:text-amber-800"
                >
                  Bu eksende yazı oluştur
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}

          {suggestedPillars.length === 0 && (
            <div className="rounded-[24px] border border-dashed border-stone-300 bg-white/70 p-12 text-center text-sm leading-6 text-stone-600 xl:col-span-2">
              Strateji üretmek için önce kategori veya ürün verisi bulunmalı.
            </div>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[26px] border border-stone-200/50 bg-[linear-gradient(135deg,#2f261f_0%,#4a382b_55%,#6b4a31_100%)] p-6 text-white shadow-[0_20px_50px_-30px_rgba(60,33,14,0.6)] md:p-7">
        <div className="relative z-10">
          <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
            İçerik kalitesi rehberi
          </div>
          <h3 className="mt-3 flex items-center gap-2 text-xl font-semibold">
            <TrendingUp className="h-5 w-5 text-amber-300" />
            İçerik kalite çerçevesi
          </h3>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <GuideCard
              value={`${safeGuidelines.pillar.minWords}+`}
              label="Pillar için minimum kelime"
              description="Kapsamlı ana konu rehberi"
            />
            <GuideCard
              value={`${safeGuidelines.cluster.minWords}+`}
              label="Cluster için minimum kelime"
              description="Belirli alt konuya odaklanan detaylı yazı"
            />
            <GuideCard
              value={`${storeContext?.focusTerms.length || 0}`}
              label="Otomatik bulunan odak terim"
              description="Ürün ve kategori verilerinden üretilir"
            />
          </div>
        </div>

        <div className="hidden" />
        <div className="hidden" />
      </section>
    </div>
  );
}

function HeaderMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3">
      <div className="text-2xl font-semibold text-stone-900">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</div>
    </div>
  );
}

function ViewModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-white text-stone-900 shadow-sm"
          : "text-stone-500 hover:text-stone-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StrategyMetricCard({
  icon,
  label,
  total,
  target,
  accentClass,
  progressColor,
}: {
  icon: ReactNode;
  label: string;
  total: number;
  target?: number;
  accentClass: string;
  progressColor: string;
}) {
  const ratio = target ? Math.min((total / Math.max(target, 1)) * 100, 100) : 100;

  return (
    <div className="rounded-[24px] border border-stone-200/80 bg-white/92 p-5 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.45)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${accentClass}`}>
          {icon}
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold text-stone-900">{total}</div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</div>
        </div>
      </div>

      {typeof target === "number" ? (
        <>
          <div className="flex items-center justify-between text-sm text-stone-600">
            <span>Hedef</span>
            <span className="font-medium text-stone-900">{target}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100">
            <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${ratio}%` }} />
          </div>
        </>
      ) : (
        <div className="text-sm text-stone-600">Bağımsız içerik adedi görüntüleniyor.</div>
      )}
    </div>
  );
}

function GuideCard({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
      <div className="text-3xl font-semibold text-amber-200">{value}</div>
      <div className="mt-2 text-sm font-medium text-white">{label}</div>
      <div className="mt-1 text-xs leading-5 text-stone-300">{description}</div>
    </div>
  );
}

function TopicTypeBadge({ type }: { type: TopicType }) {
  const styles = {
    pillar: "border-amber-200 bg-amber-50 text-amber-800",
    cluster: "border-orange-200 bg-orange-50 text-orange-800",
    standalone: "border-stone-200 bg-stone-100 text-stone-700",
  };

  const labels = {
    pillar: "Pillar",
    cluster: "Cluster",
    standalone: "Yazı",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function SeoScoreBadge({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold">
          {score}
        </span>
        Güçlü
      </div>
    );
  }

  if (score >= 60) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold">
          {score}
        </span>
        Orta
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-600">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold">
        {score || "-"}
      </span>
      Geliştirilmeli
    </div>
  );
}
