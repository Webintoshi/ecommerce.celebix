import { Product } from "@/types/product";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { extractPlainTextFromProductDescription } from "@/lib/product-description";

export interface KeywordRule {
  id: string;
  keyword: string;
  url: string;
  active: boolean;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function autoLinkContent(content: string, rules: KeywordRule[]): string {
  if (!content) return "";

  let nextContent = content;
  const activeRules = rules
    .filter((rule) => rule.active && rule.keyword.trim().length > 0)
    .sort((a, b) => b.keyword.length - a.keyword.length);

  for (const rule of activeRules) {
    const regex = new RegExp(`(?<!<[^>]*)(${escapeRegExp(rule.keyword)})(?![^<]*>)`, "i");
    let matched = false;

    nextContent = nextContent.replace(regex, (match) => {
      if (matched) return match;
      matched = true;
      return `<a href="${rule.url}" class="text-primary hover:underline font-medium" title="${match}">${match}</a>`;
    });
  }

  return nextContent;
}

const STORAGE_KEY = "celebix_storefront_seo_rules";

export function getSeoRules(): KeywordRule[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveSeoRules(rules: KeywordRule[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

import { getAllProducts } from "./products";

export async function generateDefaultRulesFromProducts(): Promise<KeywordRule[]> {
  const products = await getAllProducts();
  return products.map((product) => ({
    id: `rule-${product.id}`,
    keyword: product.name,
    url: `/urunler/${product.slug}`,
    active: true,
  }));
}

export function generateMetaTags(product: Product): { title: string; description: string } {
  const brand = STOREFRONT_RUNTIME.name;
  let title = product.name;
  const extras: string[] = [];

  if (product.sugarFree) extras.push("Sekersiz");
  if (product.vegan) extras.push("Vegan");
  if (product.glutenFree && !extras.includes("Sekersiz")) extras.push("Glutensiz");

  if (extras.length > 0) {
    title += ` - ${extras.join(" & ")}`;
  }

  title += ` | ${brand}`;

  let description =
    product.shortDescription ||
    extractPlainTextFromProductDescription(product.description, product.name).slice(0, 150);
  if (!description.endsWith(".")) description += ".";

  description += " Kaliteli sunum, guven veren detaylar ve hizli siparis akisi.";
  if (product.sugarFree) description += " Seker ilavesiz secenek.";
  description += ` ${brand} ile hemen inceleyin.`;

  if (description.length > 160) {
    description = `${description.substring(0, 157)}...`;
  }

  return { title, description };
}
