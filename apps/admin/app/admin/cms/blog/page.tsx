"use client";

import { type ElementType, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
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
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
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
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="CMS"
            title="Blog"
            description="Blog içerikleri ve strateji eksenlerini yönetin."
            actions={
              <Link
                href="/admin/cms/blog/yeni"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
              >
                <Plus className="h-4 w-4" />
                Yeni yazı
              </Link>
            }
            metrics={
              <>
                <MetricCell label="Toplam" value={posts.length} detail="yazı" icon={FileText} />
                <MetricCell label="Pillar" value={progress.pillar.total} detail="eksen" icon={Target} />
                <MetricCell label="Cluster" value={progress.cluster.total} detail="içerik" icon={LayoutGrid} />
                <MetricCell label="Bağımsız" value={progress.standalone.total} detail="yazı" icon={List} />
              </>
            }
          />

        {notice ? (
          <section
            className={`border-y px-5 py-4 ${
              notice.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-[8px] border ${
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

        <section className="grid gap-3 border-b border-[#E1E7EF] bg-[#F9F9F9] pb-4 min-[1080px]:grid-cols-[auto_minmax(0,1fr)] min-[1080px]:items-center">
          <div className="flex flex-col gap-3 min-[1080px]:contents">
            <div className="flex w-fit flex-wrap items-center gap-1 rounded-[8px] border border-[#DCE3EC] bg-white p-1">
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
              <div className="grid flex-1 gap-2 min-[860px]:grid-cols-[minmax(0,1fr)_260px_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95A5]" />
                  <input
                    type="text"
                    placeholder="Yazılarda ara"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="h-10 w-full rounded-[8px] border border-[#DCE3EC] bg-white py-2 pl-11 pr-3 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
                  />
                </label>

                <label className="flex h-10 items-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563]">
                  <Filter className="h-4 w-4 text-[#8B95A5]" />
                  <select
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-[#4B5563] outline-none"
                  >
                    <option value="all">Tüm kategoriler</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex h-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#6B7280]">
                  {filteredPosts.length} kayıt gösteriliyor
                </div>
              </div>
            ) : (
              <div className="flex h-10 flex-1 items-center justify-end rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#6B7280]">
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
        </AdminPageShell>
      </div>
    </main>
  );
}

function LoadingState() {
  return (
    <section className="flex min-h-[260px] items-center justify-center border-y border-[#E1E7EF] bg-[#F9F9F9] text-sm font-semibold text-[#6B7280]">
      <div className="flex flex-col items-center justify-center text-center">
        <Loader2 className="mb-3 h-5 w-5 animate-spin text-[#FF6A00]" />
        Blog stratejisi yükleniyor
      </div>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="border-y border-rose-200 bg-rose-50 px-5 py-6">
      <div className="flex items-start gap-3 text-rose-700">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h2 className="text-base font-semibold text-[#111827]">Blog stratejisi yüklenemedi</h2>
          <p className="mt-1 text-sm font-medium leading-6">{message}</p>
        </div>
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
    <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 md:flex-row md:items-center md:justify-between xl:px-5">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
            İçerik listesi
          </div>
          <p className="mt-1 text-xs font-medium text-[#6B7280]">
            Yazı, kategori ve SEO durumu aynı tabloda.
          </p>
        </div>
        <div className="rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
          Toplam {totalPosts} yazı içinden {posts.length} kayıt gösteriliyor.
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left">
          <thead>
            <tr className="border-b border-[#DCE3EC] bg-[#F9F9F9]">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                Yazı
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                Tip
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                Kategori
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                SEO
              </th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                Tarih
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                Aksiyonlar
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E1E7EF]">
            {posts.map((post) => (
              <tr key={post.id} className="transition-colors hover:bg-[#FFF8F3]">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="hidden h-14 w-14 flex-shrink-0 overflow-hidden rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] sm:block">
                      {post.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.coverImage} alt={post.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#9CA3AF]">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
                        {post.wordCount} kelime
                      </div>
                      <Link
                        href={`/admin/cms/blog/${post.id}`}
                        className="mt-2 block max-w-[480px] truncate text-base font-semibold leading-6 text-[#111827] transition-colors hover:text-[#E85D04]"
                      >
                        {post.title}
                      </Link>
                      <p className="mt-1 line-clamp-1 max-w-xl text-sm font-medium leading-6 text-[#6B7280]">
                        {post.excerpt}
                      </p>
                      <div className="mt-2 text-xs font-semibold text-[#E85D04]">
                        Ana anahtar kelime: {post.primaryKeyword}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 align-top">
                  <TopicTypeBadge type={post.topicType} />
                </td>
                <td className="px-5 py-4 align-top">
                  <span className="text-sm font-semibold text-[#4B5563]">
                    {categories.find((category) => category.id === post.category)?.name || post.category}
                  </span>
                </td>
                <td className="px-5 py-4 align-top">
                  <SeoScoreBadge score={post.seoScore} />
                </td>
                <td className="px-5 py-4 align-top text-sm font-semibold text-[#4B5563]">
                  <div className="inline-flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 opacity-60" />
                    {format(post.publishedAt, "d MMM yyyy", { locale: tr })}
                  </div>
                </td>
                <td className="px-5 py-4 align-top">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/cms/blog/${post.id}`}
                      className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                    >
                      <FileEdit className="h-4 w-4" />
                      Düzenle
                    </Link>
                    <button
                      type="button"
                      onClick={() => void onDelete(post)}
                      disabled={deletingPostId === post.id}
                      className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-70"
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
                <td colSpan={6} className="px-5 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[12px] border border-[#FFD1B5] bg-[#FFF1E8] text-[#FF6A00]">
                    <FileText className="h-7 w-7" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#111827]">Henüz yazı bulunmuyor</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-[#6B7280]">
                    İlk blog yazınızı oluşturarak içerik planını başlatın.
                  </p>
                  <Link
                    href="/admin/cms/blog/yeni"
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white transition hover:bg-[#E85D04]"
                  >
                    <Plus className="h-4 w-4" />
                    Yeni yazı
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StrategyMetricCard
          icon={<Target className="h-5 w-5 text-[#FF6A00]" />}
          label="Pillar"
          total={progress.pillar.total}
          target={progress.pillar.target}
          accentClass="border-[#FFD1B5] bg-[#FFF1E8]"
          progressColor="bg-[#FF6A00]"
        />
        <StrategyMetricCard
          icon={<LayoutGrid className="h-5 w-5 text-[#FF6A00]" />}
          label="Cluster"
          total={progress.cluster.total}
          target={progress.cluster.target}
          accentClass="border-[#DCE3EC] bg-[#F9F9F9]"
          progressColor="bg-[#FF6A00]"
        />
        <StrategyMetricCard
          icon={<FileText className="h-5 w-5 text-[#6B7280]" />}
          label="Bağımsız yazı"
          total={progress.standalone.total}
          accentClass="border-[#DCE3EC] bg-[#F9F9F9]"
          progressColor="bg-[#FF6A00]"
        />
      </div>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-4 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-4 xl:flex-row xl:items-center xl:justify-between xl:px-5">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#FF6A00]">
              Strateji eksenleri
            </div>
            <h2 className="mt-2 flex items-center gap-2 text-base font-semibold text-[#111827]">
              <Lightbulb className="h-4 w-4 text-[#FF6A00]" />
              Dinamik pillar stratejisi
            </h2>
            <p className="mt-1 text-sm font-medium leading-6 text-[#6B7280]">
              {storeContext
                ? `${storeContext.totalCategories} kategori ve ${storeContext.totalProducts} ürün taranarak mağazaya özel içerik ekseni çıkarıldı.`
                : "Mağaza kategorileri ve ürünleri taranarak öneri üretildi."}
            </p>
          </div>

          <Link
            href="/admin/cms/blog/yeni"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
          >
            <Plus className="h-4 w-4" />
            Bu eksende yazı oluştur
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-2 xl:p-5">
          {suggestedPillars.map((pillar) => (
            <article
              key={pillar.id}
              className={`rounded-[10px] border p-4 transition ${
                pillar.existingPillarPostId
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-[#DCE3EC] bg-white hover:border-[#FFD1B5] hover:bg-[#FFF8F3]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]">
                    {pillar.productCount} ürün
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-[#111827]">{pillar.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-[#6B7280]">
                    {pillar.description}
                  </p>
                </div>

                <span
                  className={`shrink-0 text-xs font-semibold ${
                    pillar.existingPillarPostId
                      ? "text-emerald-700"
                      : "text-[#E85D04]"
                  }`}
                >
                  {pillar.existingPillarPostId ? "Pillar hazır" : "Pillar bekliyor"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {pillar.targetKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-[8px] border border-[#FFD1B5] bg-[#FFF1E8] px-2.5 py-1 text-xs font-semibold text-[#E85D04]"
                  >
                    {keyword}
                  </span>
                ))}
              </div>

              <div className="mt-4 rounded-[8px] border border-[#E1E7EF] bg-[#F9F9F9] p-3">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">
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
                        className={`flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-sm font-medium ${
                          reached
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-white text-[#4B5563]"
                        }`}
                      >
                        {reached ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-[#CBD5E1]" />
                        )}
                        <span className={reached ? "line-through opacity-70" : ""}>{clusterTitle}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 border-t border-[#E1E7EF] pt-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-[#6B7280]">İlerleme</span>
                  <span className="font-semibold text-[#111827]">
                    {pillar.existingClusterCount} / {pillar.suggestedClusters.length}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#E1E7EF]">
                  <div
                    className="h-full rounded-full bg-[#FF6A00] transition-all"
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
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#E85D04] transition hover:text-[#FF6A00]"
                >
                  Bu eksende yazı oluştur
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}

          {suggestedPillars.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-[#DCE3EC] bg-[#F9F9F9] p-12 text-center text-sm font-medium leading-6 text-[#6B7280] xl:col-span-2">
              Strateji üretmek için önce kategori veya ürün verisi bulunmalı.
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-4 xl:px-5">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#FF6A00]">
            İçerik kalitesi rehberi
          </div>
          <h3 className="mt-2 flex items-center gap-2 text-base font-semibold text-[#111827]">
            <TrendingUp className="h-4 w-4 text-[#FF6A00]" />
            İçerik kalite çerçevesi
          </h3>
        </div>
        <div className="grid grid-cols-1 divide-y divide-[#E1E7EF] md:grid-cols-3 md:divide-x md:divide-y-0">
          <GuideCard
            value={`${safeGuidelines.pillar.minWords}+`}
            label="Pillar minimum kelime"
            description="Kapsamlı ana konu rehberi"
          />
          <GuideCard
            value={`${safeGuidelines.cluster.minWords}+`}
            label="Cluster minimum kelime"
            description="Alt konuya odaklanan detaylı yazı"
          />
          <GuideCard
            value={`${storeContext?.focusTerms.length || 0}`}
            label="Odak terim"
            description="Ürün ve kategori verilerinden üretilir"
          />
        </div>
      </section>
    </div>
  );
}

function MetricCell({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ElementType;
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <Icon className="h-4 w-4 text-[#9CA3AF]" />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
        <span className="pb-1 text-sm font-medium text-[#6B7280]">{detail}</span>
      </div>
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
      className={`inline-flex h-8 items-center gap-2 rounded-[7px] px-3 text-sm font-semibold transition ${
        active
          ? "bg-[#FF6A00] text-white"
          : "text-[#6B7280] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
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
    <div className="rounded-[12px] border border-[#DCE3EC] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-[8px] border ${accentClass}`}>
          {icon}
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{total}</div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6B7280]">{label}</div>
        </div>
      </div>

      {typeof target === "number" ? (
        <>
          <div className="flex items-center justify-between text-sm font-medium text-[#6B7280]">
            <span>Hedef</span>
            <span className="font-semibold text-[#111827]">{target}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E1E7EF]">
            <div className={`h-full rounded-full ${progressColor}`} style={{ width: `${ratio}%` }} />
          </div>
        </>
      ) : (
        <div className="text-sm font-medium text-[#6B7280]">Bağımsız içerik adedi görüntüleniyor.</div>
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
    <div className="bg-white px-4 py-4 xl:px-5">
      <div className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</div>
      <div className="mt-2 text-sm font-semibold text-[#111827]">{label}</div>
      <div className="mt-1 text-xs font-medium leading-5 text-[#6B7280]">{description}</div>
    </div>
  );
}

function TopicTypeBadge({ type }: { type: TopicType }) {
  const styles = {
    pillar: "text-[#E85D04]",
    cluster: "text-[#FF6A00]",
    standalone: "text-[#6B7280]",
  };

  const labels = {
    pillar: "Pillar",
    cluster: "Cluster",
    standalone: "Yazı",
  };

  return (
    <span
      className={`inline-flex items-center text-xs font-semibold ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function SeoScoreBadge({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
        <span className="text-xs font-bold">
          {score}
        </span>
        Güçlü
      </div>
    );
  }

  if (score >= 60) {
    return (
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#E85D04]">
        <span className="text-xs font-bold">
          {score}
        </span>
        Orta
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#6B7280]">
      <span className="text-xs font-bold">
        {score || "-"}
      </span>
      Geliştirilmeli
    </div>
  );
}
