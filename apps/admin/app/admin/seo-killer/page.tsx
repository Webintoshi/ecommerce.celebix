"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import {
  ArrowRight,
  Code2,
  FileCode,
  FileText,
  FolderOpen,
  Gauge,
  Globe2,
  Package,
  RefreshCw,
  Share2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  AdminActionButton,
  AdminLoadingState,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

type SeoBucket = {
  total: number;
  completed: number;
  avgScore: number;
};

type SeoStats = {
  products: SeoBucket;
  categories: SeoBucket;
  pages: SeoBucket;
  overallScore: number;
};

type SeoRecord = {
  seo_title?: string | null;
  meta_title?: string | null;
  seo_description?: string | null;
  meta_description?: string | null;
  images?: unknown[];
};

type SeoModule = {
  title: string;
  description: string;
  href: string;
  icon: ElementType;
  value: string;
  detail: string;
  accent?: boolean;
};

const EMPTY_STATS: SeoStats = {
  products: { total: 0, completed: 0, avgScore: 0 },
  categories: { total: 0, completed: 0, avgScore: 0 },
  pages: { total: 0, completed: 0, avgScore: 0 },
  overallScore: 0,
};

function calculateScore(hasTitle: boolean, hasDesc: boolean, hasImage: boolean): number {
  let score = 0;
  if (hasTitle) score += 40;
  if (hasDesc) score += 40;
  if (hasImage) score += 20;
  return score;
}

function MetricCell({
  label,
  value,
  context,
  loading,
}: {
  label: string;
  value: string;
  context: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7D8795]">{label}</p>
      {loading ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded-[8px] bg-[#EEF3F7]" />
      ) : (
        <div className="mt-3 flex items-end gap-2">
          <span className="text-3xl font-semibold leading-none tracking-[-0.04em] text-[#111827]">{value}</span>
          <span className="pb-1 text-sm font-medium text-[#667085]">{context}</span>
        </div>
      )}
    </div>
  );
}

function percent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

function StatusDot({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-[#16A34A]" : value >= 60 ? "bg-[#FF6A00]" : "bg-[#EF4444]";
  return <span className={cn("h-2.5 w-2.5 rounded-full", tone)} />;
}

function SeoModuleRow({ module }: { module: SeoModule }) {
  const Icon = module.icon;

  return (
    <Link
      href={module.href}
      className="grid min-h-[76px] gap-3 px-4 py-3.5 transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)] min-[900px]:grid-cols-[minmax(0,1fr)_140px_150px_40px] min-[900px]:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border bg-white",
            module.accent ? "border-[#FFC7A8] text-[#FF6A00]" : "border-[#DCE3EC] text-[#7D8795]",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-[#182232]">{module.title}</span>
          <span className="mt-1 block truncate text-xs text-[#667085]">{module.description}</span>
        </span>
      </div>
      <span className="text-sm font-semibold text-[#182232] min-[900px]:text-right">{module.value}</span>
      <span className="w-fit rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] px-2.5 py-1 text-xs font-semibold text-[#667085] min-[900px]:justify-self-start">
        {module.detail}
      </span>
      <span className="hidden h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#7D8795] min-[900px]:flex">
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function PriorityRow({
  icon: Icon,
  title,
  value,
  href,
}: {
  icon: ElementType;
  title: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 border-t border-[#E3E9F0] px-4 py-3 transition hover:bg-[#FFF8F3]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[#FFC7A8] bg-[#FFF4EC] text-[#FF6A00]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold text-[#182232]">{title}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-[#E85D04]">{value}</span>
    </Link>
  );
}

export default function SEODashboard() {
  const [stats, setStats] = useState<SeoStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const productsRes = await fetch("/api/products");
      const productsData = await productsRes.json();
      const products = (productsData.products || []) as SeoRecord[];

      const categoriesRes = await fetch("/api/categories");
      const categoriesData = await categoriesRes.json();
      const categories = (categoriesData.categories || []) as SeoRecord[];

      let productCompleted = 0;
      let productTotalScore = 0;
      products.forEach((product) => {
        const hasTitle = product.seo_title || product.meta_title;
        const hasDesc = product.seo_description || product.meta_description;
        const hasImage = Array.isArray(product.images) && product.images.length > 0;
        const score = calculateScore(Boolean(hasTitle), Boolean(hasDesc), hasImage);
        productTotalScore += score;
        if (score >= 60) productCompleted += 1;
      });

      let categoryCompleted = 0;
      let categoryTotalScore = 0;
      categories.forEach((category) => {
        const score = calculateScore(Boolean(category.seo_title), Boolean(category.seo_description), true);
        categoryTotalScore += score;
        if (score >= 60) categoryCompleted += 1;
      });

      const staticPages = [
        { hasTitle: true, hasDesc: true },
        { hasTitle: true, hasDesc: true },
        { hasTitle: true, hasDesc: true },
        { hasTitle: true, hasDesc: true },
        { hasTitle: false, hasDesc: false },
        { hasTitle: false, hasDesc: false },
      ];

      let pageCompleted = 0;
      let pageTotalScore = 0;
      staticPages.forEach((page) => {
        const score = calculateScore(page.hasTitle, page.hasDesc, true);
        pageTotalScore += score;
        if (score >= 60) pageCompleted += 1;
      });

      const productAvg = products.length > 0 ? Math.round(productTotalScore / products.length) : 0;
      const categoryAvg = categories.length > 0 ? Math.round(categoryTotalScore / categories.length) : 0;
      const pageAvg = Math.round(pageTotalScore / staticPages.length);

      setStats({
        products: {
          total: products.length,
          completed: productCompleted,
          avgScore: productAvg,
        },
        categories: {
          total: categories.length,
          completed: categoryCompleted,
          avgScore: categoryAvg,
        },
        pages: {
          total: staticPages.length,
          completed: pageCompleted,
          avgScore: pageAvg,
        },
        overallScore: Math.round((productAvg + categoryAvg + pageAvg) / 3),
      });
    } catch (error) {
      console.error("Error loading SEO data:", error);
      setStats(EMPTY_STATS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const modules = useMemo<SeoModule[]>(
    () => [
      {
        title: "Ürün SEO",
        description: "Ürün başlığı, açıklaması ve görsel sinyalleri.",
        href: "/admin/seo-killer/urunler",
        icon: Package,
        value: `${stats.products.completed}/${stats.products.total}`,
        detail: `%${percent(stats.products.completed, stats.products.total)}`,
        accent: true,
      },
      {
        title: "Kategori SEO",
        description: "Kategori metaları ve arama görünümü.",
        href: "/admin/seo-killer/kategoriler",
        icon: FolderOpen,
        value: `${stats.categories.completed}/${stats.categories.total}`,
        detail: `%${percent(stats.categories.completed, stats.categories.total)}`,
      },
      {
        title: "Sayfa SEO",
        description: "Statik sayfaların meta kalitesi.",
        href: "/admin/seo-killer/sayfalar",
        icon: FileText,
        value: `${stats.pages.completed}/${stats.pages.total}`,
        detail: `%${percent(stats.pages.completed, stats.pages.total)}`,
      },
      {
        title: "Sitemap",
        description: "Sitemap ve robots bağlantılarını kontrol edin.",
        href: "/admin/seo-killer/sitemap",
        icon: FileCode,
        value: "Canlı",
        detail: "XML",
      },
      {
        title: "Sosyal Önizleme",
        description: "Paylaşım kartlarını platform bazında görün.",
        href: "/admin/seo-killer/sosyal-onizleme",
        icon: Share2,
        value: "OG",
        detail: "Önizleme",
      },
      {
        title: "Kod Entegrasyonları",
        description: "GTM, Search Console ve Pixel kodları.",
        href: "/admin/seo-killer/kod-entegrasyonlari",
        icon: Code2,
        value: "Ayar",
        detail: "Gelişmiş",
      },
      {
        title: "Hızlı İndeks",
        description: "IndexNow ve sitemap ping işlemleri.",
        href: "/admin/seo-killer/hizli-index",
        icon: Zap,
        value: "Ping",
        detail: "Arama",
        accent: true,
      },
    ],
    [stats],
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F9F9F9] px-4 py-5 sm:px-6 lg:px-8">
        <AdminLoadingState label="SEO merkezi hazırlanıyor" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F9F9F9] px-4 py-5 text-[#111827] sm:px-6 lg:px-8">
      <AdminPageShell className="mx-auto max-w-none">
        <AdminPageHeader
          sectionLabel="SEO"
          title="SEO araçları"
          description="Arama görünürlüğü, sitemap ve entegrasyonları yönetin."
          actions={
            <AdminActionButton type="button" onClick={() => void loadData()}>
              <RefreshCw className="h-4 w-4" />
              Yenile
            </AdminActionButton>
          }
          metrics={
            <>
              <MetricCell label="Genel skor" value={String(stats.overallScore)} context="puan" />
              <MetricCell label="Ürün" value={String(stats.products.completed)} context={`${stats.products.total} kayıt`} />
              <MetricCell label="Kategori" value={String(stats.categories.completed)} context={`${stats.categories.total} kayıt`} />
              <MetricCell label="Sayfa" value={String(stats.pages.completed)} context={`${stats.pages.total} sabit`} />
            </>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="grid grid-cols-[minmax(0,1fr)_140px_150px_40px] border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563] max-[899px]:hidden">
              <span>Araç</span>
              <span className="text-right">Durum</span>
              <span>Tip</span>
              <span />
            </div>
            <div className="divide-y divide-[#E3E9F0]">
              {modules.map((module) => (
                <SeoModuleRow key={module.href} module={module} />
              ))}
            </div>
          </section>

          <aside className="h-fit overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#182232]">SEO durumu</h2>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between rounded-[10px] border border-[#DCE3EC] bg-[#F9F9F9] px-3 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-[#182232]">
                  <StatusDot value={stats.overallScore} />
                  Genel sağlık
                </span>
                <span className="text-xl font-semibold tracking-[-0.04em] text-[#111827]">{stats.overallScore}</span>
              </div>
              <div className="mt-3 overflow-hidden rounded-[10px] border border-[#DCE3EC] bg-white">
                <PriorityRow
                  icon={Package}
                  title="Eksik ürün"
                  value={String(Math.max(stats.products.total - stats.products.completed, 0))}
                  href="/admin/seo-killer/urunler"
                />
                <PriorityRow
                  icon={FolderOpen}
                  title="Eksik kategori"
                  value={String(Math.max(stats.categories.total - stats.categories.completed, 0))}
                  href="/admin/seo-killer/kategoriler"
                />
                <PriorityRow
                  icon={FileText}
                  title="Eksik sayfa"
                  value={String(Math.max(stats.pages.total - stats.pages.completed, 0))}
                  href="/admin/seo-killer/sayfalar"
                />
              </div>
              <div className="mt-3 rounded-[10px] border border-[#FFC7A8] bg-[#FFF4EC] px-3 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#C24D00]">
                  <Gauge className="h-4 w-4" />
                  Öncelik
                </div>
                <p className="mt-1 text-sm leading-6 text-[#667085]">
                  Ürün meta alanlarını tamamlamak arama görünürlüğüne en hızlı katkıyı verir.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/seo-killer/sitemap"
            className="flex items-center justify-between rounded-[12px] border border-[#DCE3EC] bg-white px-4 py-3 text-sm font-semibold text-[#182232] transition hover:border-[#FFC7A8] hover:text-[#E85D04]"
          >
            Sitemap
            <Globe2 className="h-4 w-4" />
          </Link>
          <Link
            href="/admin/seo-killer/sosyal-onizleme"
            className="flex items-center justify-between rounded-[12px] border border-[#DCE3EC] bg-white px-4 py-3 text-sm font-semibold text-[#182232] transition hover:border-[#FFC7A8] hover:text-[#E85D04]"
          >
            Sosyal önizleme
            <Share2 className="h-4 w-4" />
          </Link>
          <Link
            href="/admin/seo-killer/hizli-index"
            className="flex items-center justify-between rounded-[12px] border border-[#DCE3EC] bg-white px-4 py-3 text-sm font-semibold text-[#182232] transition hover:border-[#FFC7A8] hover:text-[#E85D04]"
          >
            Hızlı indeks
            <Zap className="h-4 w-4" />
          </Link>
        </section>
      </AdminPageShell>
    </main>
  );
}
