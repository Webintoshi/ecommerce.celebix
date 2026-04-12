"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  publicSrc: string;
  faceName: string;
  fallbackFamily: string;
  style: CSSProperties;
  targetVisualHeightPx: {
    leather: number;
    watch: number;
  };
};

type PreviewConfig = {
  image: string;
  imageAlt: string;
  textPositionClass: string;
  textToneClass: string;
  defaultText?: string | null;
  sizePreset: "watch" | "leather";
  maxCharacters: number;
};

const BASE_LEATHER_FONT_SIZE = 30;
const MIN_LEATHER_FONT_SIZE = 30;
const MAX_LEATHER_FONT_SIZE = 56;
const BASE_WATCH_FONT_SIZE = 60;
const MIN_WATCH_FONT_SIZE = 42;
const MAX_WATCH_FONT_SIZE = 82;

const FONT_OPTIONS: FontOption[] = [
  {
    id: "monotype",
    label: "1. Monotype",
    publicSrc: "/preview-fonts/Monotype-Corsiva-Regular.ttf",
    faceName: "Derycraft Monotype",
    fallbackFamily:
      '"Monotype Corsiva", "Apple Chancery", "URW Chancery L", "Lucida Handwriting", cursive',
    style: {
      fontStyle: "italic",
      fontWeight: 500,
      letterSpacing: "-0.015em",
    },
    targetVisualHeightPx: {
      leather: 39,
      watch: 62,
    },
  },
  {
    id: "book-antiqua",
    label: "2. Book Antiqua",
    publicSrc: "/preview-fonts/bookantiqua.ttf",
    faceName: "Derycraft Book Antiqua",
    fallbackFamily:
      '"Book Antiqua", "Palatino Linotype", Palatino, "URW Palladio L", serif',
    style: {
      fontWeight: 500,
      letterSpacing: "0.01em",
    },
    targetVisualHeightPx: {
      leather: 37,
      watch: 58,
    },
  },
  {
    id: "stoic",
    label: "3. Stoic",
    publicSrc: "/preview-fonts/Stoic-Regular.ttf",
    faceName: "Derycraft Stoic",
    fallbackFamily: '"Baskerville", "Times New Roman", Georgia, serif',
    style: {
      fontWeight: 700,
      letterSpacing: "0.03em",
    },
    targetVisualHeightPx: {
      leather: 36,
      watch: 55,
    },
  },
];

const PERSONALIZATION_FONT_FACE_CSS = `
@font-face {
  font-family: "Derycraft Monotype";
  src: url("/preview-fonts/Monotype-Corsiva-Regular.ttf") format("truetype");
  font-weight: 500;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "Derycraft Book Antiqua";
  src: url("/preview-fonts/bookantiqua.ttf") format("truetype");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Derycraft Stoic";
  src: url("/preview-fonts/Stoic-Regular.ttf") format("truetype");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
`;

const PREVIEW_COPY = [
  {
    lead: "Dikkat:",
    text: "Bu ön izleme temsilidir.",
  },
  {
    lead: null,
    text: "Ürünleriniz üzerinde seçtiğiniz kişiselleştirme alanına isim veya özel bir yazı yapabiliriz. Yazı, belirtilen kazıma alanına okunaklı ve estetik bir şekilde işlenecektir.",
  },
  {
    lead: null,
    text: "Yazı, belirttiğiniz büyük-küçük harf ve boşluk düzeniyle hazırlanır. Lütfen yazınızı dikkatlice kontrol ediniz.",
  },
  {
    lead: "Not:",
    text: "Özelleştirilmiş siparişlerde iade veya değişim yapılamaz.",
  },
];

const LEATHER_GOODS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/1.3.jpg",
  imageAlt: "Deri ürün kişiselleştirme ön izlemesi",
  textPositionClass:
    "bottom-[11%] right-[6%] w-[84%] text-right sm:bottom-[13%] sm:right-[8%]",
  textToneClass: "text-[#1f140f]",
  defaultText: "Ön izleme",
  sizePreset: "leather",
  maxCharacters: 15,
};

const WATCH_STRAPS_PREVIEW: PreviewConfig = {
  image:
    "https://pub-4a729225991f4b33aa7ab5c294391cec.r2.dev/Ekstralar/11.avif",
  imageAlt: "Saat kayışı kişiselleştirme ön izlemesi",
  textPositionClass:
    "left-1/2 top-1/2 w-[78%] -translate-x-1/2 -translate-y-1/2 text-center",
  textToneClass: "text-[#1a0f0a]",
  defaultText: "Yazı",
  sizePreset: "watch",
  maxCharacters: 6,
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
  productName?: string | null
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
      value.includes("bund")
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

function getInitialPreviewFontSize(
  displayText: string,
  preset: PreviewConfig["sizePreset"]
) {
  if (preset === "watch") {
    if (displayText.length >= 6) {
      return 56;
    }

    if (displayText.length >= 4) {
      return 62;
    }

    return 68;
  }

  return BASE_LEATHER_FONT_SIZE;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function PersonalizationPreview({
  category,
  subcategory,
  productName,
}: PersonalizationPreviewProps) {
  const previewConfig = useMemo(
    () => resolvePreviewConfig(category, subcategory, productName),
    [category, subcategory, productName]
  );
  const [previewText, setPreviewText] = useState("");
  const [selectedFontId, setSelectedFontId] = useState(FONT_OPTIONS[0]?.id || "");
  const [fontReadyTick, setFontReadyTick] = useState(0);

  const selectedFont =
    FONT_OPTIONS.find((option) => option.id === selectedFontId) || FONT_OPTIONS[0];

  if (!previewConfig) {
    return null;
  }

  const previewImage = resolveStorefrontAssetUrl(previewConfig.image);
  const usesProxiedPreview = isProxiedStorefrontAssetUrl(previewImage);
  const typedText = previewText.trim();
  const displayText = typedText || previewConfig.defaultText || "Ön izleme";

  const previewTextRef = useRef<HTMLSpanElement | null>(null);
  const measurementRef = useRef<HTMLSpanElement | null>(null);
  const initialPreviewFontSize = useMemo(
    () => getInitialPreviewFontSize(displayText, previewConfig.sizePreset),
    [displayText, previewConfig.sizePreset]
  );
  const [resolvedPreviewFontSize, setResolvedPreviewFontSize] = useState(
    initialPreviewFontSize
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    let active = true;

    document.fonts
      .load(`${BASE_WATCH_FONT_SIZE}px "${selectedFont.faceName}"`, displayText)
      .catch((error) => {
        console.error("Preview font load failed:", error);
      })
      .finally(() => {
        if (active) {
          setFontReadyTick((current) => current + 1);
        }
      });

    return () => {
      active = false;
    };
  }, [displayText, selectedFont.faceName]);

  useLayoutEffect(() => {
    const previewTextElement = previewTextRef.current;
    const measurementElement = measurementRef.current;

    if (!previewTextElement || !measurementElement) {
      setResolvedPreviewFontSize(initialPreviewFontSize);
      return;
    }

    const isWatchPreview = previewConfig.sizePreset === "watch";
    const baseFontSize = isWatchPreview
      ? BASE_WATCH_FONT_SIZE
      : BASE_LEATHER_FONT_SIZE;
    const minimumFontSize = isWatchPreview
      ? MIN_WATCH_FONT_SIZE
      : MIN_LEATHER_FONT_SIZE;
    const maximumFontSize = isWatchPreview
      ? MAX_WATCH_FONT_SIZE
      : MAX_LEATHER_FONT_SIZE;
    const targetVisualHeightPx = isWatchPreview
      ? selectedFont.targetVisualHeightPx.watch
      : selectedFont.targetVisualHeightPx.leather;

    measurementElement.textContent = displayText;
    measurementElement.style.fontSize = `${baseFontSize}px`;

    const measuredHeight =
      measurementElement.getBoundingClientRect().height || baseFontSize;
    let nextFontSize =
      (baseFontSize * targetVisualHeightPx) / measuredHeight;

    nextFontSize = clamp(nextFontSize, minimumFontSize, maximumFontSize);
    measurementElement.style.fontSize = `${nextFontSize}px`;

    const availableWidth =
      previewTextElement.parentElement?.getBoundingClientRect().width ||
      previewTextElement.getBoundingClientRect().width;
    const measuredWidth = measurementElement.getBoundingClientRect().width;

    if (measuredWidth > availableWidth && measuredWidth > 0) {
      nextFontSize = clamp(
        nextFontSize * (availableWidth / measuredWidth),
        minimumFontSize,
        maximumFontSize
      );
    }

    setResolvedPreviewFontSize(Math.round(nextFontSize * 100) / 100);
  }, [
    displayText,
    fontReadyTick,
    initialPreviewFontSize,
    previewConfig.sizePreset,
    selectedFont.targetVisualHeightPx,
  ]);

  const previewFontFamily = `"${selectedFont.faceName}", ${selectedFont.fallbackFamily}`;

  return (
    <section className="mx-auto w-full max-w-[360px] border-t border-neutral-200 pt-4">
      <style jsx global>{PERSONALIZATION_FONT_FACE_CSS}</style>

      <div className="relative mb-3 flex items-center justify-center gap-3">
        <h3
          style={{ fontSize: "24px", lineHeight: "31px" }}
          className="font-semibold tracking-[0.02em] text-neutral-950"
        >
          Kişiselleştirme Önizlemesi
        </h3>
        <Search className="absolute right-0 h-3.5 w-3.5 text-[#8A6B37]" />
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
        <label className="sr-only" htmlFor="personalization-preview-text">
          Yazınızı girin
        </label>
        <input
          id="personalization-preview-text"
          value={previewText}
          onChange={(event) =>
            setPreviewText(
              event.target.value.slice(0, previewConfig.maxCharacters)
            )
          }
          placeholder="Yazınızı Ekleyin"
          maxLength={previewConfig.maxCharacters}
          className="h-10 rounded-[12px] border border-[#8cb8df] bg-white px-4 text-[13px] text-neutral-900 shadow-[0_0_0_1px_rgba(140,184,223,0.18),0_10px_22px_rgba(84,109,138,0.08)] outline-none transition-colors placeholder:text-neutral-400 focus:border-[#6b9fce]"
        />

        <label className="sr-only" htmlFor="personalization-preview-font">
          Yazı tipini seçin
        </label>
        <select
          id="personalization-preview-font"
          value={selectedFontId}
          onChange={(event) => setSelectedFontId(event.target.value)}
          className="h-10 rounded-[12px] border border-[#8cb8df] bg-white px-4 text-[13px] text-neutral-900 shadow-[0_0_0_1px_rgba(140,184,223,0.18),0_10px_22px_rgba(84,109,138,0.08)] outline-none transition-colors focus:border-[#6b9fce]"
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2.5 overflow-hidden rounded-[20px] shadow-[0_16px_28px_rgba(63,41,28,0.16)]">
        <div className="relative aspect-[16/7] bg-[#ead8c5]">
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
          >
            <span
              ref={previewTextRef}
              data-preview-font-size={resolvedPreviewFontSize}
              data-preview-font-family={selectedFont.faceName}
              style={{
                fontFamily: previewFontFamily,
                fontSize: `${resolvedPreviewFontSize}px`,
                ...selectedFont.style,
                fontWeight: typedText ? 700 : 600,
                whiteSpace: "nowrap",
                display: "inline-block",
                maxWidth: "100%",
                lineHeight: 1.02,
              }}
            >
              {displayText}
            </span>
          </div>

          <span
            ref={measurementRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 -z-10 opacity-0"
            style={{
              fontFamily: previewFontFamily,
              ...selectedFont.style,
              fontWeight: typedText ? 700 : 600,
              whiteSpace: "nowrap",
              lineHeight: 1.02,
            }}
          />
        </div>
      </div>

      <ul className="mt-3 space-y-2.5 text-[14px] leading-7 text-neutral-900">
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
