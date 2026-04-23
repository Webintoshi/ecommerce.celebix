import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import type { BlogCategoryInfo, BlogPost } from "@/types/blog";

export const BLOG_CATEGORIES: BlogCategoryInfo[] = [
  {
    id: "design",
    name: "Tasarim Notlari",
    slug: "tasarim-notlari",
    description: "Urun tasarimi, materyal dili ve secim kriterleri.",
    icon: "◇",
  },
  {
    id: "workshop",
    name: "Atolye",
    slug: "atolye",
    description: "Uretim kalitesi, iscilik ve detay odakli icerikler.",
    icon: "▣",
  },
  {
    id: "guides",
    name: "Rehberler",
    slug: "rehberler",
    description: "Satin alma kararini kolaylastiran editor rehberleri.",
    icon: "→",
  },
  {
    id: "stories",
    name: "Hikayeler",
    slug: "hikayeler",
    description: "Marka hikayeleri, koleksiyon cikislari ve editor notlari.",
    icon: "∞",
  },
  {
    id: "updates",
    name: "Guncellemeler",
    slug: "guncellemeler",
    description: `${STOREFRONT_RUNTIME.name} tarafindaki yeni gelismeler.`,
    icon: "•",
  },
];

export const SUGGESTED_PILLARS = [
  {
    id: "urun-secim-rehberi",
    title: "Urun Secim Rehberi",
    description: "Musteriye karar aninda guven verecek ana editorial omurga.",
    targetKeywords: ["urun secim rehberi", "satin alma rehberi", "koleksiyon rehberi"],
    suggestedClusters: [
      "Dogru urun secimi icin 5 kritik ipucu",
      "Materyal ve iscilik farki nasil anlatilir",
      "Hediye odakli urun secimi nasil kolaylastirilir",
      "Koleksiyon yapisi storefrontta nasil sunulmali",
      "Premium urun anlatimi icin PDP dili nasil kurulur",
    ],
  },
  {
    id: "marka-ve-deneyim",
    title: "Marka ve Deneyim Rehberi",
    description: "Storefront guvenini ve editorial dili besleyecek icerik omurgasi.",
    targetKeywords: ["marka hikayesi", "alisveris deneyimi", "musteri guveni"],
    suggestedClusters: [
      "Magaza politikalarini guven veren dille anlatma",
      "Kargo ve iade metinleri neden donusumu etkiler",
      "Blog ile koleksiyon hikayesi nasil desteklenir",
      "Yorumlar ve sosyal kanit nasil guclenir",
      "Yeni ziyaretciyi markaya isindiran landing mantigi",
    ],
  },
];

export const CONTENT_GUIDELINES = {
  pillar: {
    minWords: 1600,
    idealWords: 2200,
    description: "Ana konuyu guclu sekilde sahiplenen referans icerik.",
  },
  cluster: {
    minWords: 900,
    idealWords: 1300,
    description: "Belirli bir ihtiyaci cevaplayan destekleyici yazi.",
  },
  standalone: {
    minWords: 600,
    idealWords: 900,
    description: "Tek basina deger ureten editorial blog yazisi.",
  },
};

export const SEO_CHECKLIST = [
  { id: "title", label: "SEO Basligi", weight: 15 },
  { id: "meta", label: "Meta Aciklama", weight: 10 },
  { id: "heading", label: "H1 Baslik", weight: 10 },
  { id: "subheadings", label: "H2/H3 Alt Basliklar", weight: 10 },
  { id: "keyword", label: "Anahtar Kelime Kullanimi", weight: 15 },
  { id: "internal", label: "Ic Link", weight: 10 },
  { id: "product", label: "Urun Linki", weight: 10 },
  { id: "image", label: "Gorsel ve Alt Metin", weight: 10 },
  { id: "wordcount", label: "Kelime Sayisi", weight: 10 },
];

export const BLOG_POSTS: BlogPost[] = [];

export function getBlogPosts(): BlogPost[] {
  return BLOG_POSTS.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function getFeaturedPosts(limit = 3): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.featured)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit);
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function getPostsByCategory(category: string): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.category === category).sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
  );
}

export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  return BLOG_POSTS.filter((candidate) => candidate.category === post.category && candidate.id !== post.id)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit);
}

export function searchPosts(query: string): BlogPost[] {
  const needle = query.toLowerCase();
  return BLOG_POSTS.filter(
    (post) =>
      post.title.toLowerCase().includes(needle) ||
      post.excerpt.toLowerCase().includes(needle) ||
      post.tags.some((tag) => tag.toLowerCase().includes(needle)),
  );
}

export function getPillars(): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.topicType === "pillar");
}

export function getClustersByPillar(pillarId: string): BlogPost[] {
  return BLOG_POSTS.filter((post) => post.topicType === "cluster" && post.pillarId === pillarId);
}

export function calculateSEOScore(post: Partial<BlogPost>): number {
  let score = 0;
  const guidelines = CONTENT_GUIDELINES[post.topicType || "standalone"];

  if (post.wordCount && post.wordCount >= guidelines.minWords) {
    score += 10;
    if (post.wordCount >= guidelines.idealWords) score += 5;
  }

  if (post.primaryKeyword?.length) score += 15;
  if (post.targetKeywords && post.targetKeywords.length >= 3) score += 10;
  if (post.internalLinks && post.internalLinks.length > 0) score += 10;
  if (post.relatedProducts && post.relatedProducts.length > 0) score += 10;
  if (post.title && post.title.length >= 30) score += 15;
  if (post.excerpt && post.excerpt.length >= 100) score += 10;
  if (post.coverImage) score += 10;
  if (post.tags && post.tags.length >= 3) score += 5;

  return Math.min(score, 100);
}

export function getContentProgress(): {
  pillar: { total: number; target: number };
  cluster: { total: number; target: number };
  standalone: { total: number };
} {
  const pillars = getPillars();
  const clusters = BLOG_POSTS.filter((post) => post.topicType === "cluster");
  const standalone = BLOG_POSTS.filter((post) => post.topicType === "standalone");

  return {
    pillar: { total: pillars.length, target: SUGGESTED_PILLARS.length },
    cluster: { total: clusters.length, target: pillars.length * 5 },
    standalone: { total: standalone.length },
  };
}
