import type { PublicStarterThemePresentation } from "@celebix/saas-contracts";

const PACK_KEYS = new Set(["paket ici adet", "paket adedi", "paket ici miktar", "koli ici adet"]);
const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").trim();

/** A package is merchant data; neither stock nor the product title establishes its size. */
export function packagePieces(attributes: Readonly<Record<string, string>>): number | undefined {
  const raw = Object.entries(attributes).find(([key]) => PACK_KEYS.has(normalize(key)))?.[1];
  if (!raw) return undefined;
  const text = raw.trim().replace(/\s+adet$/iu, "");
  if (!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)$/u.test(text)) return undefined;
  const amount = Number(text.replace(/\./g, ""));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 10_000_000 ? amount : undefined;
}

export function hizliMenuImages(presentation: PublicStarterThemePresentation) {
  const images: Record<string, Readonly<{ url: string; altText: string }>> = {};
  if (presentation.schemaVersion !== 1) for (const section of presentation.sections) {
    if (section.kind === "category_grid") for (const item of section.items) images[item.slug] = item.image;
  }
  return images;
}
