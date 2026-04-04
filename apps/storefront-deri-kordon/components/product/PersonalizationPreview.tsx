"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import {
  isProxiedStorefrontAssetUrl,
  resolveStorefrontAssetUrl,
} from "@/lib/asset-url";

type PersonalizationPreviewProps = {
  category?: string | null;
  subcategory?: string | null;
};

type FontOption = {
  id: string;
  label: string;
  family: string;
};

type PreviewConfig = {
  image: string;
  imageAlt: string;
  textPositionClass: string;
  textToneClass: string;
};

const FONT_OPTIONS: FontOption[] = [
  {
    id: "monotype",
    label: "1. Monotype",
    family:
      '"Monotype Corsiva", "Apple Chancery", "URW Chancery L", "Lucida Handwriting", cursive',
  },
  {
    id: "book-antiqua",
    label: "2. Book Antiqua",
    family:
      '"Book Antiqua", "Palatino Linotype", Palatino, "URW Palladio L", serif',
  },
  {
    id: "stoic",
    label: "3. Stoic",
    family: 'Georgia, "Times New Roman", serif',
  },
];

const LEATHER_GOODS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/1.3.jpg",
  imageAlt: "Deri urun kisilestirme onizleme",
  textPositionClass: "left-1/2 top-[53%] w-[72%] -translate-x-1/2 -translate-y-1/2",
  textToneClass: "text-[#2d2118]/85",
};

const WATCH_STRAPS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/11.avif",
  imageAlt: "Saat kayisi kisilestirme onizleme",
  textPositionClass: "left-1/2 top-[50%] w-[68%] -translate-x-1/2 -translate-y-1/2",
  textToneClass: "text-[#251b15]/80",
};

function normalizeCategoryValue(value?: string | null) {
  return (value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolvePreviewConfig(category?: string | null, subcategory?: string | null) {
  const values = [category, subcategory].map(normalizeCategoryValue);

  const belongsToWatchFamily = values.some(
    (value) =>
      value.includes("apple-watch") ||
      value.includes("watch") ||
      value.includes("saat-kayis")
  );

  if (belongsToWatchFamily) {
    return WATCH_STRAPS_PREVIEW;
  }

  const belongsToLeatherGoodsFamily = values.some(
    (value) =>
      value.includes("cuzdan") ||
      value.includes("kartlik") ||
      value.includes("aksesuar") ||
      value.includes("canta") ||
      value.includes("organizer")
  );

  if (belongsToLeatherGoodsFamily) {
    return LEATHER_GOODS_PREVIEW;
  }

  return null;
}

export function PersonalizationPreview({
  category,
  subcategory,
}: PersonalizationPreviewProps) {
  const previewConfig = useMemo(
    () => resolvePreviewConfig(category, subcategory),
    [category, subcategory]
  );
  const [previewText, setPreviewText] = useState("");
  const [selectedFontId, setSelectedFontId] = useState(FONT_OPTIONS[0]?.id || "");

  const selectedFont =
    FONT_OPTIONS.find((option) => option.id === selectedFontId) || FONT_OPTIONS[0];

  if (!previewConfig) {
    return null;
  }

  const previewImage = resolveStorefrontAssetUrl(previewConfig.image);
  const usesProxiedPreview = isProxiedStorefrontAssetUrl(previewImage);
  const displayText = previewText.trim() || "Kazima Onizlemesi";

  return (
    <section className="space-y-4 border-t border-neutral-200 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.35em] text-neutral-700">
          Kisisellestirme On Izleme
        </h3>
        <Search className="h-4 w-4 text-[#8A6B37]" />
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(220px,0.9fr)]">
        <label className="sr-only" htmlFor="personalization-preview-text">
          Yazinizi girin
        </label>
        <input
          id="personalization-preview-text"
          value={previewText}
          onChange={(event) => setPreviewText(event.target.value.slice(0, 20))}
          placeholder="Yazinizi Ekleyin"
          className="h-12 rounded-xl border border-[#9fc1df] bg-white px-4 text-[15px] text-neutral-900 shadow-[0_0_0_1px_rgba(159,193,223,0.15)] outline-none transition-colors placeholder:text-neutral-400 focus:border-[#6d99bf]"
        />

        <label className="sr-only" htmlFor="personalization-preview-font">
          Yazi tipini secin
        </label>
        <select
          id="personalization-preview-font"
          value={selectedFontId}
          onChange={(event) => setSelectedFontId(event.target.value)}
          className="h-12 rounded-xl border border-[#9fc1df] bg-white px-4 text-[15px] text-neutral-900 shadow-[0_0_0_1px_rgba(159,193,223,0.15)] outline-none transition-colors focus:border-[#6d99bf]"
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-neutral-200 bg-[#f3eee8]">
        <div className="relative aspect-[16/7]">
          <Image
            src={previewImage}
            alt={previewConfig.imageAlt}
            fill
            sizes="(min-width: 1280px) 28vw, (min-width: 1024px) 36vw, 100vw"
            className="object-cover"
            unoptimized={usesProxiedPreview}
          />
          <div
            className={`pointer-events-none absolute ${previewConfig.textPositionClass} text-center text-[clamp(20px,2vw,38px)] leading-none ${previewConfig.textToneClass}`}
            style={{
              fontFamily: selectedFont.family,
              textShadow: "0 1px 1px rgba(255,255,255,0.12)",
            }}
          >
            {displayText}
          </div>
        </div>
      </div>

      <ul className="space-y-2.5 text-[15px] leading-6 text-neutral-700">
        <li className="flex gap-3">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
          <span>
            Urunlerin uzerinde belirtilen kazima alanina yazi / isim kazimasi
            yapabiliriz. Kisilestirme ornekleridir.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
          <span>
            Bu onizleme temsilidir. Yazi, belirtilen kazima alanina okunakli ve
            estetik ebatlarda islenecektir.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
          <span>
            Not: Ozellestirilmis siparislerin iade / degisimi mumkun
            olmamaktadir.
          </span>
        </li>
      </ul>
    </section>
  );
}
