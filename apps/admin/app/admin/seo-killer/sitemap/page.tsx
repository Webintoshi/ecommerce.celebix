"use client";

import { CheckCircle2, Download, ExternalLink, FileCode, Globe2, ShieldCheck } from "lucide-react";
import {
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminPageShell";
import { buildStorefrontUrl, STORE_RUNTIME } from "@/lib/store-runtime";

type SitemapLink = {
  label: string;
  href: string;
  type: string;
};

function MetricCell({ label, value, context }: { label: string; value: string; context: string }) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7D8795]">{label}</p>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-semibold leading-none tracking-[-0.04em] text-[#111827]">{value}</span>
        <span className="pb-1 text-sm font-medium text-[#667085]">{context}</span>
      </div>
    </div>
  );
}

function SitemapRow({ item }: { item: SitemapLink }) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      className="grid min-h-[70px] gap-3 px-4 py-3 transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)] min-[900px]:grid-cols-[180px_minmax(0,1fr)_110px_40px] min-[900px]:items-center"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#FFC7A8] bg-[#FFF4EC] text-[#FF6A00]">
          <FileCode className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold text-[#182232]">{item.label}</span>
      </span>
      <span className="truncate font-mono text-xs text-[#667085]">{item.href}</span>
      <span className="w-fit rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] px-2.5 py-1 text-xs font-semibold text-[#667085]">
        {item.type}
      </span>
      <span className="hidden h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#7D8795] min-[900px]:flex">
        <ExternalLink className="h-4 w-4" />
      </span>
    </a>
  );
}

export default function SitemapManagerPage() {
  const sitemapUrl = buildStorefrontUrl("/sitemap.xml");
  const sitemapProductsUrl = buildStorefrontUrl("/sitemap-products.xml");
  const sitemapPagesUrl = buildStorefrontUrl("/sitemap-pages.xml");
  const sitemapCollectionsUrl = buildStorefrontUrl("/sitemap-collections.xml");
  const robotsUrl = buildStorefrontUrl("/robots.txt");

  const sitemapLinks: SitemapLink[] = [
    { label: "Sitemap index", href: sitemapUrl, type: "XML" },
    { label: "Ürün sitemap", href: sitemapProductsUrl, type: "Ürün" },
    { label: "Sayfa sitemap", href: sitemapPagesUrl, type: "Sayfa" },
    { label: "Koleksiyon sitemap", href: sitemapCollectionsUrl, type: "Koleksiyon" },
    { label: "Robots", href: robotsUrl, type: "TXT" },
  ];

  return (
    <main className="min-h-screen bg-[#F9F9F9] px-4 py-5 text-[#111827] sm:px-6 lg:px-8">
      <AdminPageShell className="mx-auto max-w-none">
        <AdminPageHeader
          sectionLabel="SEO"
          title="Sitemap"
          description="Sitemap ve robots bağlantılarını kontrol edin."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={sitemapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[14px] border border-[var(--admin-border)] bg-white px-3.5 text-sm font-medium text-[var(--admin-text)] transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] xl:min-h-11 xl:px-4"
              >
                <ExternalLink className="h-4 w-4" />
                Aç
              </a>
              <a
                href={sitemapUrl}
                download
                rel="noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[14px] bg-[var(--admin-accent)] px-3.5 text-sm font-medium text-white shadow-[0_12px_28px_rgba(255,106,0,0.22)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] xl:min-h-11 xl:px-4"
              >
                <Download className="h-4 w-4" />
                İndir
              </a>
            </div>
          }
          metrics={
            <>
              <MetricCell label="Durum" value="Aktif" context="erişim" />
              <MetricCell label="Kaynak" value="5" context="link" />
              <MetricCell label="Vitrin" value={STORE_RUNTIME.name} context="store" />
              <MetricCell label="Robots" value="1" context="dosya" />
            </>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="grid grid-cols-[180px_minmax(0,1fr)_110px_40px] border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563] max-[899px]:hidden">
              <span>Dosya</span>
              <span>Bağlantı</span>
              <span>Tip</span>
              <span />
            </div>
            <div className="divide-y divide-[#E3E9F0]">
              {sitemapLinks.map((item) => (
                <SitemapRow key={item.href} item={item} />
              ))}
            </div>
          </section>

          <aside className="h-fit overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#182232]">Kontrol</h2>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-start gap-3 rounded-[10px] border border-[#DCE3EC] bg-[#F9F9F9] px-3 py-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#16A34A]" />
                <div>
                  <p className="text-sm font-semibold text-[#182232]">Erişilebilir</p>
                  <p className="mt-1 text-sm leading-6 text-[#667085]">
                    Sitemap bağlantıları vitrin alan adı üzerinden açılır.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-[10px] border border-[#FFC7A8] bg-[#FFF4EC] px-3 py-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#FF6A00]" />
                <div>
                  <p className="text-sm font-semibold text-[#C24D00]">Search Console</p>
                  <p className="mt-1 break-all text-sm leading-6 text-[#667085]">
                    {STORE_RUNTIME.storefrontUrl}
                  </p>
                </div>
              </div>
              <a
                href={robotsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-[10px] border border-[#DCE3EC] bg-white px-3 py-3 text-sm font-semibold text-[#182232] transition hover:border-[#FFC7A8] hover:text-[#E85D04]"
              >
                Robots.txt
                <Globe2 className="h-4 w-4" />
              </a>
            </div>
          </aside>
        </div>
      </AdminPageShell>
    </main>
  );
}
