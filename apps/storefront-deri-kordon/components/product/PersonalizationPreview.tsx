"use client";

import { type CSSProperties, useMemo, useState } from "react";
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
  style: CSSProperties;
};

type PreviewConfig = {
  image: string;
  imageAlt: string;
  textPositionClass: string;
  textToneClass: string;
  staticText?: string | null;
};

const FONT_OPTIONS: FontOption[] = [
  {
    id: "monotype",
    label: "1. Monotype",
    family:
      '"Monotype Corsiva", "Apple Chancery", "URW Chancery L", "Lucida Handwriting", cursive',
    style: {
      fontStyle: "italic",
      fontWeight: 500,
      letterSpacing: "-0.015em",
    },
  },
  {
    id: "book-antiqua",
    label: "2. Book Antiqua",
    family:
      '"Book Antiqua", "Palatino Linotype", Palatino, "URW Palladio L", serif',
    style: {
      fontWeight: 500,
      letterSpacing: "0.01em",
    },
  },
  {
    id: "stoic",
    label: "3. Stoic",
    family: '"Baskerville", "Times New Roman", Georgia, serif',
    style: {
      fontWeight: 700,
      letterSpacing: "0.03em",
    },
  },
];

const LEATHER_GOODS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/1.3.jpg",
  imageAlt: "Deri urun kisilestirme onizleme",
  textPositionClass: "bottom-[20%] right-[11%] w-[42%] text-left",
  textToneClass: "text-[#2d2118]/85",
};

const WATCH_STRAPS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/11.avif",
  imageAlt: "Saat kayisi kisilestirme onizleme",
  textPositionClass: "bottom-[18%] right-[13%] w-[34%] text-left",
  textToneClass: "text-[#251b15]/80",
  staticText: "YAZI",
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
  const displayText =
    previewConfig.staticText || previewText.trim() || "Ön İzleme";
  const previewFontSize = previewConfig.staticText
    ? "clamp(24px, 2vw, 36px)"
    : displayText.length > 16
      ? "clamp(17px, 1.45vw, 26px)"
      : displayText.length > 10
        ? "clamp(19px, 1.65vw, 29px)"
        : "clamp(22px, 1.9vw, 32px)";

  return (
    <section className="mx-auto w-full max-w-[360px] space-y-3 border-t border-neutral-200 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.3em] text-neutral-700">
          Kişiselleştirme Ön İzleme
        </h3>
        <Search className="h-3.5 w-3.5 text-[#8A6B37]" />
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(160px,0.78fr)]">
        <label className="sr-only" htmlFor="personalization-preview-text">
          Yazinizi girin
        </label>
        <input
          id="personalization-preview-text"
          value={previewText}
          onChange={(event) => setPreviewText(event.target.value.slice(0, 20))}
          placeholder="Yazinizi Ekleyin"
          className="h-9 rounded-xl border border-[#9fc1df] bg-white px-3 text-[13px] text-neutral-900 shadow-[0_0_0_1px_rgba(159,193,223,0.15)] outline-none transition-colors placeholder:text-neutral-400 focus:border-[#6d99bf]"
        />

        <label className="sr-only" htmlFor="personalization-preview-font">
          Yazi tipini secin
        </label>
        <select
          id="personalization-preview-font"
          value={selectedFontId}
          onChange={(event) => setSelectedFontId(event.target.value)}
          className="h-9 rounded-xl border border-[#9fc1df] bg-white px-3 text-[13px] text-neutral-900 shadow-[0_0_0_1px_rgba(159,193,223,0.15)] outline-none transition-colors focus:border-[#6d99bf]"
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mx-auto overflow-hidden rounded-[18px] border border-neutral-200 bg-[#f3eee8]">
        <div className="relative aspect-[16/6.2]">
          <Image
            src={previewImage}
            alt={previewConfig.imageAlt}
            fill
            sizes="(min-width: 1280px) 21vw, (min-width: 1024px) 26vw, 100vw"
            className="object-cover"
            unoptimized={usesProxiedPreview}
          />
          <div
            className={`pointer-events-none absolute ${previewConfig.textPositionClass} leading-none ${previewConfig.textToneClass}`}
            style={{
              fontFamily: selectedFont.family,
              fontSize: previewFontSize,
              ...selectedFont.style,
              textShadow: "0 1px 1px rgba(255,255,255,0.12)",
            }}
          >
            {displayText}
          </div>
        </div>
      </div>

      <ul className="space-y-2 text-[13px] leading-5 text-neutral-700 sm:text-[14px]">
        <li className="flex gap-3">
          <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
          <span>
            Urunlerin uzerinde belirtilen kazima alanina yazi / isim kazimasi
            yapabiliriz. Kisilestirme ornekleridir.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
          <span>
            Bu onizleme temsilidir. Yazi, belirtilen kazima alanina okunakli ve
            estetik ebatlarda islenecektir.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
          <span>
            Not: Ozellestirilmis siparislerin iade / degisimi mumkun
            olmamaktadir.
          </span>
        </li>
      </ul>
    </section>
  );
}
