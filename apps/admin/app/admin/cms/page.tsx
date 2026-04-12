"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  ChevronRight,
  BarChart3,
  PenTool,
  Clock,
  Eye,
} from "lucide-react";
import { fetchBlogStrategySnapshot } from "@/lib/blog-strategy-client";
import { fetchCmsPages } from "@/lib/cms-pages";
import type { CmsPage } from "@/types/cms";
import type { BlogPost } from "@/types/blog";
import { cn } from "@/lib/utils";

const statTone = [
  "from-[#fff2e8] to-white text-[#FE6100] border-[#FE6100]/12",
  "from-[#fff5ec] to-white text-[#cc6a2a] border-[#efcfb1]",
  "from-[#fff7ef] to-white text-[#b97a2e] border-[#edd7ba]",
  "from-[#f6f0e8] to-white text-[#7d5a41] border-[#e3d8cb]",
];

export default function CmsDashboard() {
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [cmsPages, setCmsPages] = useState<CmsPage[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      try {
        const [pages, blogSnapshot] = await Promise.all([fetchCmsPages(), fetchBlogStrategySnapshot()]);

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
    {
      label: "Blog Yazilari",
      count: blogPosts.length,
      icon: PenTool,
    },
    {
      label: "İçerik Sayfaları",
      count: cmsPages.length,
      icon: FileText,
    },
    {
      label: "Taslaklar",
      count:
        blogPosts.filter((post) => post.status === "draft").length +
        cmsPages.filter((page) => page.status === "draft").length,
      icon: Clock,
    },
    {
      label: "Yayinda",
      count:
        blogPosts.filter((post) => post.status === "published").length +
        cmsPages.filter((page) => page.status === "published").length,
      icon: Eye,
    },
  ];

  return (
    <div className="min-h-screen bg-[#f6efe7] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-6 shadow-[0_24px_80px_rgba(120,74,32,0.10)] md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/18 bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#C54E00]">
              İçerik Yönetimi
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#eadacd] bg-white px-4 py-2.5 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
            >
              <ArrowLeft className="h-4 w-4" />
              Geri
            </Link>
          </div>
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/10 blur-3xl" />
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="rounded-[28px] border border-[#eadccd] bg-white/90 p-5 shadow-[0_18px_40px_rgba(99,67,37,0.08)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9a7c67]">{stat.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[#2f241d]">{stat.count}</p>
                </div>
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-[18px] border bg-gradient-to-br shadow-sm",
                    statTone[index]
                  )}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DashboardCard
            href="/admin/cms/blog"
            title="Blog Yonetimi"
            description="Haberler, duyurular ve SEO odakli editoryal icerikleri yonetin."
            icon={PenTool}
            tone="from-[#fff2e8] to-white text-[#FE6100] border-[#FE6100]/12"
            rows={[
              { label: "Toplam Yazi", value: `${blogPosts.length}` },
              { label: "İçerik Stratejisi", value: "Pillar-Cluster", accent: true },
            ]}
          />

          <DashboardCard
            href="/admin/cms/sayfalar"
            title="Sabit Sayfalar"
            description="Hakkimizda, Iletisim ve SSS gibi sayfalarin icerigini duzenleyin."
            icon={FileText}
            tone="from-[#fff7ef] to-white text-[#c86a29] border-[#f0cfb2]"
            rows={[
              { label: "Yonetilen Sayfa", value: `${cmsPages.length}` },
              {
                label: "Yayindaki Sayfa",
                value: `${cmsPages.filter((page) => page.status === "published").length}`,
                accent: true,
              },
            ]}
          />
        </div>

        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-r from-[#2f241d] via-[#4f3829] to-[#694833] p-6 text-white shadow-[0_24px_70px_rgba(47,36,29,0.22)] md:p-8">
          <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd2af]">
                <BarChart3 className="h-3.5 w-3.5" />
                İçerik Notu
              </div>
              <p className="text-sm leading-7 text-[#f6ddcb]">
                Sabit sayfalar kontrollu bir kontratla yonetilir; her magazada ayni temel sayfalar bulunur ve storefront yalnizca yayindaki icerigi gosterir.
              </p>
            </div>
            <Link
              href="/admin/cms/sayfalar"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-[#3d2b1f] shadow-[0_16px_35px_rgba(255,255,255,0.16)] transition hover:bg-[#fff5ec] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25"
            >
              Sayfalari Yonet
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#FE6100]/20 blur-3xl" />
        </section>
      </div>
    </div>
  );
}

function DashboardCard({
  href,
  title,
  description,
  icon: Icon,
  tone,
  rows,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof PenTool;
  tone: string;
  rows: Array<{ label: string; value: string; accent?: boolean }>;
}) {
  return (
    <div className="group overflow-hidden rounded-[30px] border border-[#eadccd] bg-white/92 shadow-[0_20px_45px_rgba(99,67,37,0.08)] transition-all hover:-translate-y-1 hover:border-[#FE6100]/18 hover:shadow-[0_24px_55px_rgba(254,97,0,0.12)]">
      <div className="p-6 md:p-7">
        <div className="mb-6 flex items-center gap-4">
          <div className={cn("flex h-14 w-14 items-center justify-center rounded-[20px] border bg-gradient-to-br shadow-sm", tone)}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#2f241d]">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-[#7d6959]">{description}</p>
          </div>
        </div>

        <div className="mb-6 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between rounded-[20px] border border-[#f1e5d9] bg-[#fdf8f3] px-4 py-3">
              <span className="text-sm font-medium text-[#7b6656]">{row.label}</span>
              <span className={cn("font-semibold text-[#2f241d]", row.accent && "text-[#C54E00]")}>{row.value}</span>
            </div>
          ))}
        </div>

        <Link
          href={href}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-[#FE6100] to-[#E45700] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition hover:translate-y-[-1px] hover:from-[#f15c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18"
        >
          Görüntüle
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
