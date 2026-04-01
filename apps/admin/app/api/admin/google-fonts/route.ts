import { NextResponse } from "next/server";
import {
  FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS,
  type StoreTypographyFontCategory,
  type StoreTypographyFontOption,
  type StoreTypographyWeight,
} from "@celebix/platform-config/src/typography";

const GOOGLE_FONTS_METADATA_URL = "https://fonts.google.com/metadata/fonts";
const SUPPORTED_WEIGHTS: StoreTypographyWeight[] = ["400", "500", "600", "700", "800"];

type GoogleFontMetadataResponse = {
  familyMetadataList?: GoogleFontMetadataItem[];
};

type GoogleFontMetadataItem = {
  family?: string;
  category?: string;
  fonts?: Record<string, unknown>;
  popularity?: number;
};

function normalizeGoogleCategory(category?: string): StoreTypographyFontCategory {
  const normalized = (category ?? "").trim().toLocaleLowerCase("en-US");

  if (normalized.includes("handwriting")) return "handwriting";
  if (normalized.includes("mono")) return "monospace";
  if (normalized.includes("display")) return "display";
  if (normalized.includes("serif")) return normalized.includes("sans") ? "sans-serif" : "serif";
  return "sans-serif";
}

function extractAvailableWeights(fonts?: Record<string, unknown>): StoreTypographyWeight[] {
  if (!fonts) {
    return SUPPORTED_WEIGHTS;
  }

  const weights = Object.keys(fonts)
    .map((key) => key.replace(/[^0-9]/g, "") as StoreTypographyWeight)
    .filter((weight): weight is StoreTypographyWeight => SUPPORTED_WEIGHTS.includes(weight));

  return weights.length > 0
    ? SUPPORTED_WEIGHTS.filter((weight) => weights.includes(weight))
    : SUPPORTED_WEIGHTS;
}

function parseMetadataPayload(payload: string): GoogleFontMetadataResponse {
  const trimmed = payload.trim().replace(/^\)\]\}'\s*/, "");
  return JSON.parse(trimmed) as GoogleFontMetadataResponse;
}

function sortFonts(left: StoreTypographyFontOption & { popularity: number }, right: StoreTypographyFontOption & { popularity: number }) {
  if (left.popularity !== right.popularity) {
    return left.popularity - right.popularity;
  }

  return left.family.localeCompare(right.family, "en");
}

export async function GET() {
  try {
    const response = await fetch(GOOGLE_FONTS_METADATA_URL, {
      next: { revalidate: 60 * 60 * 24 },
      headers: {
        "User-Agent": "CelebixAdmin/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Google font metadata request failed with ${response.status}`);
    }

    const payload = await response.text();
    const data = parseMetadataPayload(payload);
    const fonts = (data.familyMetadataList ?? [])
      .map((item) => {
        const family = (item.family ?? "").trim();
        if (!family) {
          return null;
        }

        return {
          family,
          category: normalizeGoogleCategory(item.category),
          availableWeights: extractAvailableWeights(item.fonts),
          popularity: typeof item.popularity === "number" ? item.popularity : Number.MAX_SAFE_INTEGER,
          source: "google" as const,
        };
      })
      .filter((item): item is StoreTypographyFontOption & { popularity: number } => Boolean(item))
      .sort(sortFonts);

    return NextResponse.json(
      {
        success: true,
        fonts,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=86400, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch Google font catalog:", error);

    return NextResponse.json(
      {
        success: true,
        degraded: true,
        fonts: FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS.map((font, index) => ({
          ...font,
          popularity: index + 1,
        })),
      },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  }
}
