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
import { getAllProducts } from "@/lib/products";
import { STORE_RUNTIME } from "@/lib/store-runtime";

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16 ${
        active
          ? "border-[#f6c9aa] bg-[#fff4ea] text-[#C54E00] shadow-sm"
          : "border-[#eadccd] bg-white text-[#7b6656] hover:border-[#FE6100]/20 hover:bg-[#fff9f4] hover:text-[#C54E00]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function FieldLabel({ title, count, limit }: { title: string; count: number; limit: number }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="block text-sm font-medium text-[#5c4a3e]">{title}</label>
      <span className="text-xs font-medium text-[#a08673]">{count} / {limit}</span>
    </div>
  );
}

export default function SocialPreviewPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const storeHost = STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const [ogTitle, setOgTitle] = useState("");
  const [ogDesc, setOgDesc] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [activeTab, setActiveTab] = useState<"facebook" | "twitter" | "whatsapp" | "linkedin">("facebook");

  const fetchMetadata = async () => {
    if (!url) return;
    setLoading(true);

    setTimeout(async () => {
      const products = await getAllProducts();
      const slug = url.split("/").pop();
      const found = products.find((p) => p.slug === slug || url.includes(p.slug));

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
    <div className="min-h-screen bg-[#f6efe8] text-[#2f241d]">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8 md:px-8 md:py-10">
        <section className="relative overflow-hidden rounded-[34px] border border-[#eadccd] bg-gradient-to-br from-[#fff8f2] via-white to-[#f8eee5] p-8 shadow-[0_22px_70px_rgba(99,67,37,0.10)] md:p-10">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                Sosyal önizleme
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[24px] border border-[#ffd7b8] bg-gradient-to-br from-[#FE6100] to-[#d97706] text-white shadow-[0_22px_50px_rgba(254,97,0,0.22)]">
                  <Share2 className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-4xl">Sosyal Medya Önizleme</h1>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#eadccd] bg-[#2f241d] p-5 text-white shadow-[0_22px_60px_rgba(47,36,29,0.20)]">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd2af]">
                Editör modu
              </div>
              <p className="mt-4 text-sm font-medium leading-6 text-[#ead9c9]">
                Bu ekran yalnızca önizleme amaçlıdır; buradaki alanlar veritabanına yazılmaz.
              </p>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/12 blur-3xl" />
        </section>

        <section className="rounded-[30px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_45px_rgba(105,78,54,0.08)] md:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-[#fffaf5] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                URL ve meta alanları
              </div>

              <div className="mt-5 rounded-[26px] border border-[#f0e3d7] bg-[#fcf8f3] p-5">
                <FieldLabel title="Önizlenecek URL" count={url.length} limit={120} />
                <div className="flex flex-col gap-3 md:flex-row">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={`Örn: ${STORE_RUNTIME.storefrontUrl}/urunler/ornek-urun`}
                    className="min-w-0 flex-1 rounded-2xl border border-[#e8d9cb] bg-white px-4 py-3 text-sm text-[#2f241d] outline-none transition-all placeholder:text-[#b49b89] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/12"
                  />
                  <button
                    onClick={fetchMetadata}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#d97706] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(254,97,0,0.22)] transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18"
                  >
                    {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <RefreshCw className="h-4 w-4" />}
                    Önizlemeyi getir
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <FieldLabel title="OG başlık" count={ogTitle.length} limit={60} />
                  <input
                    type="text"
                    value={ogTitle}
                    onChange={(e) => setOgTitle(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8d9cb] bg-[#fffdfb] px-4 py-3 text-sm text-[#2f241d] outline-none transition-all placeholder:text-[#b49b89] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/12"
                  />
                </div>

                <div>
                  <FieldLabel title="OG açıklama" count={ogDesc.length} limit={160} />
                  <textarea
                    value={ogDesc}
                    onChange={(e) => setOgDesc(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-[#e8d9cb] bg-[#fffdfb] px-4 py-3 text-sm text-[#2f241d] outline-none transition-all placeholder:text-[#b49b89] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/12"
                  />
                </div>

                <div>
                  <FieldLabel title="OG görsel URL" count={ogImage.length} limit={160} />
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={ogImage}
                      onChange={(e) => setOgImage(e.target.value)}
                      className="min-w-0 flex-1 rounded-2xl border border-[#e8d9cb] bg-[#fffdfb] px-4 py-3 text-sm text-[#2f241d] outline-none transition-all placeholder:text-[#b49b89] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/12"
                    />
                    <button className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#eadccd] bg-white text-[#8a6f5d] transition-all hover:border-[#FE6100]/20 hover:bg-[#fff9f4] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16">
                      <ImageIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

            </div>

            <div className="lg:col-span-7">
              <div className="inline-flex items-center rounded-full border border-[#eadccd] bg-[#fffaf5] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                Canlı platform görünümü
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <TabButton active={activeTab === "facebook"} onClick={() => setActiveTab("facebook")} icon={<Facebook className="h-4 w-4" />} label="Facebook" />
                <TabButton active={activeTab === "twitter"} onClick={() => setActiveTab("twitter")} icon={<Twitter className="h-4 w-4" />} label="X / Twitter" />
                <TabButton active={activeTab === "linkedin"} onClick={() => setActiveTab("linkedin")} icon={<Linkedin className="h-4 w-4" />} label="LinkedIn" />
                <TabButton active={activeTab === "whatsapp"} onClick={() => setActiveTab("whatsapp")} icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" />
              </div>

              <div className="mt-5 flex min-h-[460px] items-center justify-center rounded-[30px] border border-[#eadccd] bg-gradient-to-br from-[#fbf5ef] to-[#f4ebe2] p-6 md:p-10">
                {activeTab === "facebook" && (
                  <div className="w-full max-w-[520px] overflow-hidden rounded-[24px] border border-[#d6dbe1] bg-white shadow-[0_18px_50px_rgba(64,78,98,0.16)]">
                    <div className="h-[260px] bg-[#d9dee4]">
                      {ogImage && <img src={ogImage} alt="Facebook önizleme" className="h-full w-full object-cover" />}
                    </div>
                    <div className="border-t border-[#d6dbe1] bg-[#f2f3f5] p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7280]">{storeHost.toUpperCase()}</p>
                      <h4 className="mt-2 truncate text-lg font-semibold text-[#111827]">{ogTitle || "Başlık"}</h4>
                      <p className="mt-1 line-clamp-2 text-sm text-[#4b5563]">{ogDesc || "Açıklama metni burada görünür."}</p>
                    </div>
                  </div>
                )}

                {activeTab === "twitter" && (
                  <div className="w-full max-w-[460px] overflow-hidden rounded-[28px] border border-[#dce1e7] bg-white shadow-[0_18px_50px_rgba(64,78,98,0.12)]">
                    <div className="h-[240px] bg-[#d9dee4]">
                      {ogImage && <img src={ogImage} alt="X önizleme" className="h-full w-full object-cover" />}
                    </div>
                    <div className="p-4">
                      <h4 className="truncate text-lg font-semibold text-[#111827]">{ogTitle || "Başlık"}</h4>
                      <p className="mt-2 line-clamp-2 text-sm text-[#4b5563]">{ogDesc || "Açıklama metni burada görünür."}</p>
                      <p className="mt-2 text-sm text-[#9ca3af]">{storeHost}</p>
                    </div>
                  </div>
                )}

                {activeTab === "linkedin" && (
                  <div className="w-full max-w-[520px] overflow-hidden rounded-[22px] border border-[#d7dbe1] bg-white shadow-[0_18px_50px_rgba(64,78,98,0.12)]">
                    <div className="h-[260px] bg-[#d9dee4]">
                      {ogImage && <img src={ogImage} alt="LinkedIn önizleme" className="h-full w-full object-cover" />}
                    </div>
                    <div className="bg-[#eef3f8] p-4">
                      <h4 className="truncate text-lg font-semibold text-[#111827]">{ogTitle || "Başlık"}</h4>
                      <p className="mt-1 text-sm text-[#6b7280]">{storeHost}</p>
                    </div>
                  </div>
                )}

                {activeTab === "whatsapp" && (
                  <div className="w-full max-w-sm rounded-[28px] bg-[#e7ddd2] p-5 shadow-inner">
                    <div className="relative flex items-start gap-3 rounded-[20px] bg-white p-3 shadow-[0_12px_30px_rgba(67,44,28,0.12)]">
                      <div className="absolute inset-y-0 left-0 w-1 rounded-l-[20px] bg-[#d0d5db]" />
                      <div className="min-w-0 flex-1 pl-2">
                        <h4 className="truncate text-sm font-semibold text-[#111827]">{ogTitle || "Başlık"}</h4>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6b7280]">{ogDesc || "Açıklama metni burada görünür."}</p>
                        <p className="mt-2 text-xs text-[#9ca3af]">{storeHost}</p>
                      </div>
                      {ogImage && (
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#d9dee4]">
                          <img src={ogImage} alt="WhatsApp önizleme" className="h-full w-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
