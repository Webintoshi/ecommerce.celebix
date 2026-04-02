"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  FileText,
  Filter,
  LayoutGrid,
  Lightbulb,
  List,
  Loader2,
  Plus,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";
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

export default function BlogListingPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "strategy">("list");
  const [snapshot, setSnapshot] = useState<BlogStrategySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      setLoading(true);
      setError(null);

      try {
        const nextSnapshot = await fetchBlogStrategySnapshot();
        if (!active) return;
        setSnapshot(nextSnapshot);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Blog stratejisi yuklenemedi.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSnapshot();

    return () => {
      active = false;
    };
  }, []);

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

  return (
    <div className="min-h-screen space-y-8 bg-gray-50/50 p-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/cms"
            className="rounded-lg border border-transparent p-2 transition-colors hover:border-gray-200 hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Blog Yazilari
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Blog iceriklerinizi yonetin ve magazaya ozel stratejiyi canli
              verilerle olusturun.
            </p>
          </div>
        </div>
        <Link
          href="/admin/cms/blog/yeni"
          className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" />
          Yeni Yazi Ekle
        </Link>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm sm:flex-row">
        <div className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              viewMode === "list"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <List className="h-4 w-4" />
            Liste
          </button>
          <button
            onClick={() => setViewMode("strategy")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              viewMode === "strategy"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Target className="h-4 w-4" />
            Strateji
          </button>
        </div>

        <div className="flex-1" />

        {viewMode === "list" && (
          <>
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Yazilarda ara..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="all">Tum Kategoriler</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : viewMode === "list" ? (
        <ListView posts={filteredPosts} categories={categories} />
      ) : (
        <StrategyView
          suggestedPillars={suggestedPillars}
          progress={progress}
          storeContext={snapshot?.storeContext}
          guidelines={snapshot?.contentGuidelines}
        />
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
      <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
      <h2 className="text-lg font-semibold text-gray-900">
        Blog stratejisi yukleniyor
      </h2>
      <p className="mt-2 text-sm text-gray-500">
        Kategoriler, urunler ve mevcut yazilar birlestiriliyor.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-12 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        Blog stratejisi yuklenemedi
      </h2>
      <p className="mt-2 text-sm text-gray-500">{message}</p>
    </div>
  );
}

function ListView({
  posts,
  categories,
}: {
  posts: BlogPost[];
  categories: BlogStrategyCategory[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Yazi
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Tip
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Kategori
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                SEO
              </th>
              <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Tarih
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {posts.map((post) => (
              <tr key={post.id} className="transition-colors hover:bg-gray-50/50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="hidden h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:block">
                      {post.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="font-medium leading-tight text-gray-900">
                        {post.title}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {post.wordCount} kelime
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <TopicTypeBadge type={post.topicType} />
                </td>
                <td className="px-6 py-4">
                  <div className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                    {categories.find((category) => category.id === post.category)?.name ||
                      post.category}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <SeoScoreBadge score={post.seoScore} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3 opacity-50" />
                    {format(post.publishedAt, "d MMM yyyy", { locale: tr })}
                  </div>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                    <FileText className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-gray-900">
                    Henuz yazi bulunmuyor
                  </h3>
                  <p className="mb-4 text-gray-500">
                    Ilk blog yazinizi olusturarak baslayin.
                  </p>
                  <Link
                    href="/admin/cms/blog/yeni"
                    className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                  >
                    <Plus className="h-4 w-4" />
                    Yeni Yazi Ekle
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
          icon={<Target className="h-6 w-6 text-purple-600" />}
          label="Pillar"
          total={progress.pillar.total}
          target={progress.pillar.target}
          accentClass="bg-purple-100"
          progressColor="bg-purple-500"
        />
        <StrategyMetricCard
          icon={<LayoutGrid className="h-6 w-6 text-blue-600" />}
          label="Cluster"
          total={progress.cluster.total}
          target={progress.cluster.target}
          accentClass="bg-blue-100"
          progressColor="bg-blue-500"
        />
        <StrategyMetricCard
          icon={<FileText className="h-6 w-6 text-emerald-600" />}
          label="Bagimsiz Yazi"
          total={progress.standalone.total}
          accentClass="bg-emerald-100"
          progressColor="bg-emerald-500"
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              Dinamik Pillar Stratejisi
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {storeContext
                ? `${storeContext.totalCategories} kategori ve ${storeContext.totalProducts} urun taranarak magazaya ozel icerik ekseni cikarildi.`
                : "Magaza kategorileri ve urunleri taranarak oneri uretildi."}
            </p>
          </div>
          <Link
            href="/admin/cms/blog/yeni"
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Yeni Yazi Ekle
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {suggestedPillars.map((pillar) => (
            <div
              key={pillar.id}
              className={`rounded-xl border-2 p-5 transition-all ${
                pillar.existingPillarPostId
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{pillar.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">{pillar.description}</p>
                </div>
                <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  {pillar.productCount} urun
                </span>
              </div>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {pillar.targetKeywords.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                  >
                    {keyword}
                  </span>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Onerilen Cluster Yazilari
                </div>
                {pillar.suggestedClusters.map((clusterTitle) => {
                  const reached =
                    pillar.existingClusterCount > 0 &&
                    pillar.suggestedClusters.indexOf(clusterTitle) <
                      pillar.existingClusterCount;

                  return (
                    <div
                      key={clusterTitle}
                      className={`flex items-center gap-2 text-sm ${
                        reached ? "text-emerald-600" : "text-gray-600"
                      }`}
                    >
                      {reached ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-gray-300" />
                      )}
                      <span className={reached ? "line-through opacity-60" : ""}>
                        {clusterTitle}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-gray-200 pt-4">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-600">Ilerleme</span>
                  <span className="font-medium text-gray-900">
                    {pillar.existingClusterCount} / {pillar.suggestedClusters.length}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${Math.min(
                        (pillar.existingClusterCount /
                          Math.max(pillar.suggestedClusters.length, 1)) *
                          100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
                <Link
                  href="/admin/cms/blog/yeni"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-gray-900 hover:text-gray-700"
                >
                  Bu eksende yazi olustur
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
          {suggestedPillars.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500 lg:col-span-2">
              Strateji uretmek icin once kategori veya urun verisi bulunmali.
            </div>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-white">
        <div className="relative z-10">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <TrendingUp className="h-5 w-5 text-purple-400" />
            İçerik Kalitesi Rehberi
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <div className="mb-1 text-2xl font-bold text-purple-400">
                {safeGuidelines.pillar.minWords}+
              </div>
              <div className="text-sm text-gray-300">
                Pillar icin minimum kelime
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Kapsamli ana konu rehberi
              </div>
            </div>
            <div>
              <div className="mb-1 text-2xl font-bold text-blue-400">
                {safeGuidelines.cluster.minWords}+
              </div>
              <div className="text-sm text-gray-300">
                Cluster icin minimum kelime
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Belirli alt konuya odaklanan detayli yazi
              </div>
            </div>
            <div>
              <div className="mb-1 text-2xl font-bold text-emerald-400">
                {storeContext?.focusTerms.length || 0}
              </div>
              <div className="text-sm text-gray-300">
                Otomatik bulunan odak terim
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Strateji bu magazanin urun ve kategori verilerinden uretiliyor
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
      </div>
    </div>
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
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${accentClass}`}>
          {icon}
        </div>
        <span className="text-3xl font-bold text-gray-900">{total}</span>
      </div>
      <div className="text-sm font-medium text-gray-900">{label}</div>
      {typeof target === "number" && (
        <>
          <div className="mt-1 text-xs text-gray-500">Hedef: {target}</div>
          <div className="mt-3 h-2 w-full rounded-full bg-gray-100">
            <div
              className={`h-2 rounded-full transition-all ${progressColor}`}
              style={{ width: `${ratio}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TopicTypeBadge({ type }: { type: TopicType }) {
  const styles = {
    pillar: "border-purple-200 bg-purple-100 text-purple-700",
    cluster: "border-blue-200 bg-blue-100 text-blue-700",
    standalone: "border-gray-200 bg-gray-100 text-gray-600",
  };

  const labels = {
    pillar: "Pillar",
    cluster: "Cluster",
    standalone: "Yazi",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function SeoScoreBadge({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
          {score}
        </div>
      </div>
    );
  }

  if (score >= 60) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
          {score}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
        {score || "-"}
      </div>
    </div>
  );
}
