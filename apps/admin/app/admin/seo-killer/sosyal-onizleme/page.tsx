"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  Facebook,
  Image as ImageIcon,
  Linkedin,
  MessageCircle,
  RefreshCw,
  Share2,
  Twitter,
} from "lucide-react";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminPageShell";
import { getAllProducts } from "@/lib/products";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";

type PreviewTab = "facebook" | "twitter" | "whatsapp" | "linkedin";

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-[8px] border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]",
        active
          ? "border-[#FFC7A8] bg-[#FFF4EC] text-[#E85D04]"
          : "border-[#DCE3EC] bg-white text-[#4B5563] hover:border-[#FFC7A8] hover:text-[#E85D04]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function FieldLabel({ title, count, limit }: { title: string; count: number; limit: number }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="block text-sm font-semibold text-[#374151]">{title}</label>
      <span className="text-xs font-medium text-[#7D8795]">{count} / {limit}</span>
    </div>
  );
}

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

const FIELD_CLASS =
  "w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 py-3 text-sm text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

export default function SocialPreviewPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const storeHost = STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const [ogTitle, setOgTitle] = useState("");
  const [ogDesc, setOgDesc] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [activeTab, setActiveTab] = useState<PreviewTab>("facebook");

  const fetchMetadata = async () => {
    if (!url) return;
    setLoading(true);

    setTimeout(async () => {
      const products = await getAllProducts();
      const slug = url.split("/").pop();
      const found = products.find((product) => product.slug === slug || url.includes(product.slug));

      if (found) {
        setOgTitle(found.seoTitle || found.name);
        setOgDesc(found.seoDescription || found.shortDescription);
        setOgImage(found.images[0]);
      } else {
        setOgTitle(`${STORE_RUNTIME.name} - ${STORE_RUNTIME.tagline}`);
        setOgDesc(`${STORE_RUNTIME.name} mağazasındaki ürünleri ve içerikleri keşfedin.`);
        setOgImage("/images/logo-bg.jpg");
      }
      setLoading(false);
    }, 800);
  };

  return (
    <main className="min-h-screen bg-[#F9F9F9] px-4 py-5 text-[#111827] sm:px-6 lg:px-8">
      <AdminPageShell className="mx-auto max-w-none">
        <AdminPageHeader
          sectionLabel="SEO"
          title="Sosyal önizleme"
          description="Paylaşım kartlarını yayın öncesi kontrol edin."
          actions={
            <AdminActionButton type="button" tone="primary" disabled={!url || loading} onClick={() => void fetchMetadata()}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Önizlemeyi Getir
            </AdminActionButton>
          }
          metrics={
            <>
              <MetricCell label="Platform" value="4" context="önizleme" />
              <MetricCell label="Başlık" value={String(ogTitle.length)} context="karakter" />
              <MetricCell label="Açıklama" value={String(ogDesc.length)} context="karakter" />
              <MetricCell label="Görsel" value={ogImage ? "Var" : "Yok"} context="OG" />
            </>
          }
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.86fr)_minmax(420px,1fr)]">
          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3">
              <h2 className="text-sm font-semibold text-[#182232]">Meta alanları</h2>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <FieldLabel title="Önizlenecek URL" count={url.length} limit={120} />
                <input
                  type="text"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={`${STORE_RUNTIME.storefrontUrl}/urunler/ornek-urun`}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <FieldLabel title="OG başlık" count={ogTitle.length} limit={60} />
                <input
                  type="text"
                  value={ogTitle}
                  onChange={(event) => setOgTitle(event.target.value)}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <FieldLabel title="OG açıklama" count={ogDesc.length} limit={160} />
                <textarea
                  value={ogDesc}
                  onChange={(event) => setOgDesc(event.target.value)}
                  rows={4}
                  className={cn(FIELD_CLASS, "resize-none leading-6")}
                />
              </div>

              <div>
                <FieldLabel title="OG görsel URL" count={ogImage.length} limit={160} />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ogImage}
                    onChange={(event) => setOgImage(event.target.value)}
                    className={FIELD_CLASS}
                  />
                  <button
                    type="button"
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#7D8795] transition hover:border-[#FFC7A8] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                    aria-label="Görsel seç"
                  >
                    <ImageIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_10px_28px_rgba(16,24,40,0.04)]">
            <div className="flex flex-col gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 min-[860px]:flex-row min-[860px]:items-center min-[860px]:justify-between">
              <h2 className="text-sm font-semibold text-[#182232]">Canlı görünüm</h2>
              <div className="flex flex-wrap gap-2">
                <TabButton active={activeTab === "facebook"} onClick={() => setActiveTab("facebook")} icon={<Facebook className="h-4 w-4" />} label="Facebook" />
                <TabButton active={activeTab === "twitter"} onClick={() => setActiveTab("twitter")} icon={<Twitter className="h-4 w-4" />} label="X" />
                <TabButton active={activeTab === "linkedin"} onClick={() => setActiveTab("linkedin")} icon={<Linkedin className="h-4 w-4" />} label="LinkedIn" />
                <TabButton active={activeTab === "whatsapp"} onClick={() => setActiveTab("whatsapp")} icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" />
              </div>
            </div>

            <div className="flex min-h-[480px] items-center justify-center bg-[#F9F9F9] p-4 sm:p-6">
              {activeTab === "facebook" && (
                <div className="w-full max-w-[540px] overflow-hidden rounded-[12px] border border-[#D6DCE5] bg-white shadow-[0_14px_30px_rgba(16,24,40,0.08)]">
                  <div className="h-[260px] bg-[#EEF3F7]">
                    {ogImage ? <img src={ogImage} alt="Facebook önizleme" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="border-t border-[#D6DCE5] bg-[#F3F5F7] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#667085]">{storeHost}</p>
                    <h3 className="mt-2 truncate text-lg font-semibold text-[#111827]">{ogTitle || "Başlık"}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-[#4B5563]">{ogDesc || "Açıklama burada görünür."}</p>
                  </div>
                </div>
              )}

              {activeTab === "twitter" && (
                <div className="w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[#D6DCE5] bg-white shadow-[0_14px_30px_rgba(16,24,40,0.08)]">
                  <div className="h-[240px] bg-[#EEF3F7]">
                    {ogImage ? <img src={ogImage} alt="X önizleme" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="p-4">
                    <h3 className="truncate text-lg font-semibold text-[#111827]">{ogTitle || "Başlık"}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-[#4B5563]">{ogDesc || "Açıklama burada görünür."}</p>
                    <p className="mt-2 text-sm text-[#7D8795]">{storeHost}</p>
                  </div>
                </div>
              )}

              {activeTab === "linkedin" && (
                <div className="w-full max-w-[540px] overflow-hidden rounded-[12px] border border-[#D6DCE5] bg-white shadow-[0_14px_30px_rgba(16,24,40,0.08)]">
                  <div className="h-[260px] bg-[#EEF3F7]">
                    {ogImage ? <img src={ogImage} alt="LinkedIn önizleme" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="bg-[#EEF3F7] p-4">
                    <h3 className="truncate text-lg font-semibold text-[#111827]">{ogTitle || "Başlık"}</h3>
                    <p className="mt-1 text-sm text-[#667085]">{storeHost}</p>
                  </div>
                </div>
              )}

              {activeTab === "whatsapp" && (
                <div className="w-full max-w-sm rounded-[12px] bg-[#E8E1D8] p-4">
                  <div className="relative flex items-start gap-3 rounded-[12px] bg-white p-3 shadow-[0_10px_24px_rgba(16,24,40,0.10)]">
                    <div className="absolute inset-y-0 left-0 w-1 rounded-l-[12px] bg-[#DCE3EC]" />
                    <div className="min-w-0 flex-1 pl-2">
                      <h3 className="truncate text-sm font-semibold text-[#111827]">{ogTitle || "Başlık"}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#667085]">{ogDesc || "Açıklama burada görünür."}</p>
                      <p className="mt-2 text-xs text-[#7D8795]">{storeHost}</p>
                    </div>
                    {ogImage ? (
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[8px] bg-[#EEF3F7]">
                        <img src={ogImage} alt="WhatsApp önizleme" className="h-full w-full object-cover" />
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="rounded-[12px] border border-[#FFC7A8] bg-[#FFF4EC] px-4 py-3 text-sm font-medium text-[#C24D00]">
          <Share2 className="mr-2 inline h-4 w-4 align-[-2px]" />
          Bu ekran yalnızca önizleme içindir; Kaydetme işlemi yapmaz.
        </div>
      </AdminPageShell>
    </main>
  );
}
