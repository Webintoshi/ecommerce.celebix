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
  {
    lead: "Dikkat:",
    text: "Bu önizleme temsilidir.",
  },
  {
    lead: null,
    text: "Ürünleriniz üzerinde seçtiğiniz kişiselleştirme alanına isim veya özel bir yazı yapabiliriz. Yazı, belirtilen kazıma alanına okunaklı simetrik ve estetik bir şekilde işlenecektir.",
  },
  {
    lead: null,
    text: "Yazı, belirtilen kazıma alanına tercihlerinizi (büyük/küçük harf/noktalama/boşluk) tam olarak belirttiğiniz gibi işlenecektir. Lütfen yazınızı dikkatlice kontrol ediniz.",
  },
  {
    lead: "Not:",
    text: "Özelleştirilmiş siparişlerde iade veya değişim yapılması mümkün değildir.",
  },
];

const LEATHER_GOODS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/1.3.jpg",
  imageAlt: "Deri urun kisilestirme onizleme",
  textPositionClass:
    "left-[17%] top-[38%] w-[60%] -translate-y-1/2 text-left",
  textToneClass: "text-[#2f211a]/90",
  defaultText: "Kazima Onizlemesi",
};

const WATCH_STRAPS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/11.avif",
  imageAlt: "Saat kayisi kisilestirme onizleme",
  textPositionClass:
    "left-[16%] top-[37%] w-[60%] -translate-y-1/2 text-left",
  textToneClass: "text-[#261a14]/90",
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

  return (
    <section className="w-full max-w-[420px] border-t border-neutral-200 pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.42em] text-neutral-800 sm:text-[11px]">
          Kişiselleştirme Ön İzleme
        </h3>
        <Search className="h-3.5 w-3.5 text-[#8A6B37]" />
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
        <label className="sr-only" htmlFor="personalization-preview-text">
          Yazinizi girin
        </label>
        <input
          id="personalization-preview-text"
          value={previewText}
          onChange={(event) => setPreviewText(event.target.value.slice(0, 6))}
          placeholder="Yazinizi Ekleyin"
          maxLength={6}
          className="h-11 rounded-[14px] border border-[#8cb8df] bg-white px-4 text-[14px] text-neutral-900 shadow-[0_0_0_1px_rgba(140,184,223,0.18),0_10px_22px_rgba(84,109,138,0.08)] outline-none transition-colors placeholder:text-neutral-400 focus:border-[#6b9fce]"
        />

        <label className="sr-only" htmlFor="personalization-preview-font">
          Yazi tipini secin
        </label>
        <select
          id="personalization-preview-font"
          value={selectedFontId}
          onChange={(event) => setSelectedFontId(event.target.value)}
          className="h-11 rounded-[14px] border border-[#8cb8df] bg-white px-4 text-[14px] text-neutral-900 shadow-[0_0_0_1px_rgba(140,184,223,0.18),0_10px_22px_rgba(84,109,138,0.08)] outline-none transition-colors focus:border-[#6b9fce]"
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 overflow-hidden rounded-[20px] shadow-[0_16px_28px_rgba(63,41,28,0.16)]">
        <div className="relative aspect-[16/6.2] bg-[#ead8c5]">
          <Image
            src={previewImage}
            alt={previewConfig.imageAlt}
            fill
            sizes="(min-width: 1280px) 24vw, (min-width: 1024px) 30vw, 100vw"
            className="object-cover"
            unoptimized={usesProxiedPreview}
          />
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

      <ul className="mt-4 space-y-3 text-[14px] leading-7 text-neutral-900">
        {PREVIEW_COPY.map((item) => (
          <li key={item.text} className="flex gap-3">
            <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-900" />
            <span>
              {item.lead ? <strong>{item.lead} </strong> : null}
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
