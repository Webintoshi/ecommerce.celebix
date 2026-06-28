"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Eye, FileText, PenTool } from "lucide-react";
import { fetchBlogStrategySnapshot } from "@/lib/blog-strategy-client";
import { fetchCmsPages } from "@/lib/cms-pages";
import type { CmsPage } from "@/types/cms";
import type { BlogPost } from "@/types/blog";
import { cn } from "@/lib/utils";

const statTone = [
  "from-white to-white text-[var(--admin-accent)] border-[var(--admin-border)]",
  "from-white to-white text-[#cc6a2a] border-[#efcfb1]",
  "from-white to-white text-[#b97a2e] border-[#edd7ba]",
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
      label: "Blog Yazıları",
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
      label: "Yayında",
      count:
        blogPosts.filter((post) => post.status === "published").length +
        cmsPages.filter((page) => page.status === "published").length,
      icon: Eye,
    },
  ];

  return (
    <div className="admin-page-root px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-none space-y-6">
        <section className="relative overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-xs)] md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)]">
              İçerik Yönetimi
            </div>
          </div>
          <div className="hidden" />
        </section>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="rounded-[12px] border border-[var(--admin-border)] bg-white p-5 shadow-[var(--shadow-xs)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9a7c67]">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[var(--admin-heading)]">
                    {stat.count}
                  </p>
                </div>
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-[18px] border bg-gradient-to-br shadow-sm",
                    statTone[index],
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
            title="Blog Yönetimi"
            description="Haberler, duyurular ve SEO odaklı editoryal içerikleri yönetin."
            icon={PenTool}
            tone="from-white to-white text-[var(--admin-accent)] border-[var(--admin-border)]"
            rows={[
              { label: "Toplam Yazı", value: `${blogPosts.length}` },
              { label: "İçerik Stratejisi", value: "Pillar-Cluster", accent: true },
            ]}
          />

          <DashboardCard
            href="/admin/cms/sayfalar"
            title="Sabit Sayfalar"
            description="Hakkımızda, İletişim ve SSS gibi sayfaların içeriğini düzenleyin."
            icon={FileText}
            tone="from-white to-white text-[#c86a29] border-[var(--admin-border)]"
            rows={[
              { label: "Yönetilen Sayfa", value: `${cmsPages.length}` },
              {
                label: "Yayındaki Sayfa",
                value: `${cmsPages.filter((page) => page.status === "published").length}`,
                accent: true,
              },
            ]}
          />
        </div>
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
    <div className="group overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-xs)] transition-all hover:-translate-y-1 hover:border-[var(--admin-accent-border)] hover:shadow-[var(--shadow-xs)]">
      <div className="p-6 md:p-7">
        <div className="mb-6 flex items-center gap-4">
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-[20px] border bg-gradient-to-br shadow-sm",
              tone,
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-[#7d6959]">{description}</p>
          </div>
        </div>

        <div className="mb-6 space-y-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3"
            >
              <span className="text-sm font-medium text-[var(--admin-text-secondary)]">{row.label}</span>
              <span className={cn("font-semibold text-[var(--admin-heading)]", row.accent && "text-[var(--admin-accent-hover)]")}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <Link
          href={href}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-[var(--admin-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.18)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
        >
          Görüntüle
        </Link>
      </div>
    </div>
  );
}
