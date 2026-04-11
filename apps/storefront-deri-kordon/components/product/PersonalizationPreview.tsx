"use client";

import { type CSSProperties, useMemo, useState } from "react";
import Image from "next/image";
import { PencilLine, Sparkles } from "lucide-react";
import {
  isProxiedStorefrontAssetUrl,
  resolveStorefrontAssetUrl,
} from "@/lib/asset-url";

type PersonalizationPreviewProps = {
  category?: string | null;
  subcategory?: string | null;
  productName?: string | null;
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
  frameClassName: string;
  textPositionClass: string;
  textToneClass: string;
  defaultText?: string | null;
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

const PREVIEW_COPY = [
  "Dikkat: Bu önizleme temsilidir.",
  "Ürünleriniz üzerinde seçtiğiniz kişiselleştirme alanına isim veya özel bir yazı yapabiliriz. Yazı, belirtilen kazıma alanına okunaklı simetrik ve estetik bir şekilde işlenecektir.",
  "Yazı, belirtilen kazıma alanına tercihlerinizi (büyük/küçük harf/noktalama/boşluk) tam olarak belirttiğiniz gibi işlenecektir. Lütfen yazınızı dikkatlice kontrol ediniz.",
  "Not: Özelleştirilmiş siparişlerde iade veya değişim yapılması mümkün değildir.",
];

const LEATHER_GOODS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/1.3.jpg",
  imageAlt: "Deri urun kisilestirme onizleme",
  frameClassName:
    "bg-[linear-gradient(180deg,#f3e8da_0%,#eadbc9_100%)] shadow-[0_18px_36px_rgba(74,45,24,0.16)]",
  textPositionClass:
    "left-[17%] top-[34%] w-[62%] -translate-y-1/2 text-left",
  textToneClass: "text-[#2c1f18]/90",
  defaultText: "Kazima Onizlemesi",
};

const WATCH_STRAPS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/11.avif",
  imageAlt: "Saat kayisi kisilestirme onizleme",
  frameClassName:
    "bg-[linear-gradient(180deg,#f5eadc_0%,#ead9c7_100%)] shadow-[0_18px_36px_rgba(74,45,24,0.16)]",
  textPositionClass:
    "left-[18%] top-[36%] w-[58%] -translate-y-1/2 text-left",
  textToneClass: "text-[#241a15]/90",
  defaultText: "Kazima Onizlemesi",
};

function normalizeCategoryValue(value?: string | null) {
  return (value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolvePreviewConfig(
  category?: string | null,
  subcategory?: string | null,
  productName?: string | null,
) {
  const values = [category, subcategory, productName].map(normalizeCategoryValue);

  const belongsToWatchFamily = values.some(
    (value) =>
      value.includes("apple-watch") ||
      value.includes("watch") ||
      value.includes("saat-kayis") ||
      value.includes("saat-kordon") ||
      value.includes("akilli-saat") ||
      value.includes("tek-katli") ||
      value.includes("cift-katli") ||
      value.includes("bund"),
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
      value.includes("organizer"),
  );

  if (belongsToLeatherGoodsFamily) {
    return LEATHER_GOODS_PREVIEW;
  }

  return null;
}

function getPreviewFontSize(displayText: string) {
  if (displayText.length >= 16) {
    return "clamp(18px, 4.2vw, 28px)";
  }

  if (displayText.length >= 10) {
    return "clamp(21px, 4.8vw, 32px)";
  }

  if (displayText.length >= 6) {
    return "clamp(24px, 5.6vw, 36px)";
  }

  return "clamp(28px, 6.4vw, 40px)";
}

export function PersonalizationPreview({
  category,
  subcategory,
  productName,
}: PersonalizationPreviewProps) {
  const previewConfig = useMemo(
    () => resolvePreviewConfig(category, subcategory, productName),
    [category, subcategory, productName],
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
  const typedText = previewText.trim();
  const displayText = typedText || previewConfig.defaultText || "Kazima Onizlemesi";
  const previewFontSize = getPreviewFontSize(displayText);
  const selectedFontLabel = selectedFont.label.replace(/^\d+\.\s*/, "");

  return (
    <section className="w-full max-w-[430px] border-t border-neutral-200/90 pt-6">
      <div className="rounded-[28px] border border-[#d8c7af] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,242,233,0.98)_100%)] p-4 shadow-[0_18px_44px_rgba(34,23,15,0.08)] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.38em] text-neutral-700">
              Kişiselleştirme Ön İzleme
            </div>
            <p className="text-[12px] leading-5 text-neutral-500 sm:text-[13px]">
              Kazıma alanına işlenecek görünümü temsili olarak inceleyin.
            </p>
          </div>
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#ccb28c] bg-white/80 text-[#8A6B37] shadow-[0_10px_20px_rgba(138,107,55,0.12)]">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
          <div className="space-y-1.5">
            <label
              htmlFor="personalization-preview-text"
              className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.24em] text-neutral-500"
            >
              <PencilLine className="h-3.5 w-3.5 text-[#8A6B37]" />
              Yazı
            </label>
            <input
              id="personalization-preview-text"
              value={previewText}
              onChange={(event) => setPreviewText(event.target.value.slice(0, 6))}
              placeholder="Yazinizi Ekleyin"
              maxLength={6}
              className="h-11 w-full rounded-[18px] border border-[#b6cae0] bg-white/95 px-4 text-[14px] text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_18px_rgba(66,92,124,0.08)] outline-none transition-all placeholder:text-neutral-400 focus:border-[#7ea8ce] focus:shadow-[0_0_0_4px_rgba(126,168,206,0.14)]"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="personalization-preview-font"
              className="text-[10px] font-medium uppercase tracking-[0.24em] text-neutral-500"
            >
              Yazı tipi
            </label>
            <select
              id="personalization-preview-font"
              value={selectedFontId}
              onChange={(event) => setSelectedFontId(event.target.value)}
              className="h-11 w-full rounded-[18px] border border-[#b6cae0] bg-white/95 px-4 text-[14px] text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_18px_rgba(66,92,124,0.08)] outline-none transition-all focus:border-[#7ea8ce] focus:shadow-[0_0_0_4px_rgba(126,168,206,0.14)]"
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-[26px] border border-[#dcc9ae] bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(127,86,48,0.06)_100%)] p-3">
          <div className={`rounded-[22px] border border-white/35 p-2 ${previewConfig.frameClassName}`}>
            <div className="relative aspect-[16/8.2] overflow-hidden rounded-[18px]">
              <Image
                src={previewImage}
                alt={previewConfig.imageAlt}
                fill
                sizes="(min-width: 1280px) 24vw, (min-width: 1024px) 30vw, 100vw"
                className="object-cover"
                unoptimized={usesProxiedPreview}
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#fff7ef]/18 to-transparent" />
              <div
                className={`pointer-events-none absolute ${previewConfig.textPositionClass} leading-none ${previewConfig.textToneClass}`}
                style={{
                  fontFamily: selectedFont.family,
                  fontSize: previewFontSize,
                  ...selectedFont.style,
                  fontWeight: typedText ? 700 : 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "block",
                  textShadow: "0 1px 0 rgba(255,255,255,0.14)",
                }}
              >
                {displayText}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[18px] border border-[#e4d6c3] bg-white/75 px-3 py-2 text-[11px] text-neutral-600 shadow-[0_6px_16px_rgba(36,22,14,0.04)]">
            <span>
              Secilen yazi tipi: <span className="font-medium text-neutral-800">{selectedFontLabel}</span>
            </span>
            <span className="rounded-full bg-[#f3eadf] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[#8A6B37]">
              Temsili gorunum
            </span>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] border border-[#e0d4c4] bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
          <div className="space-y-3 text-[13px] leading-6 text-neutral-700 sm:text-[14px]">
            {PREVIEW_COPY.map((item, index) => (
              <p
                key={item}
                className={index < PREVIEW_COPY.length - 1 ? "border-b border-[#ece2d4] pb-3" : ""}
              >
                {item}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
