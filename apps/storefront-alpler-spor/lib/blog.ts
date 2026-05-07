import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import type { BlogCategoryInfo, BlogPost } from "@/types/blog";

export const BLOG_CATEGORIES: BlogCategoryInfo[] = [
  {
    id: "design",
    name: "Tasarım Notları",
    slug: "tasarim-notlari",
    description: "Ürün tasarımı, materyal dili ve seçim kriterleri.",
    icon: "◇",
  },
  {
    id: "workshop",
    name: "Atölye",
    slug: "atolye",
    description: "Üretim kalitesi, işçilik ve detay odaklı içerikler.",
    icon: "▣",
  },
  {
    id: "guides",
    name: "Rehberler",
    slug: "rehberler",
    description: "Satın alma kararını kolaylaştıran editör rehberleri.",
    icon: "→",
  },
  {
    id: "stories",
    name: "Hikayeler",
    slug: "hikayeler",
    description: "Marka hikâyeleri, koleksiyon çıkışları ve editör notları.",
    icon: "∞",
  },
  {
    id: "updates",
    name: "Güncellemeler",
    slug: "guncellemeler",
    description: `${STOREFRONT_RUNTIME.name} tarafındaki yeni gelişmeler.`,
    icon: "•",
  },
];

export const SUGGESTED_PILLARS = [
  {
    id: "urun-secim-rehberi",
    title: "Ürün Seçim Rehberi",
    description: "Müşteriye karar anında güven verecek ana editoryal omurga.",
    targetKeywords: ["ürün seçim rehberi", "satın alma rehberi", "koleksiyon rehberi"],
    suggestedClusters: [
      "Doğru ürün seçimi için 5 kritik ipucu",
      "Materyal ve işçilik farkı nasıl anlatılır",
      "Hediye odaklı ürün seçimi nasıl kolaylaştırılır",
      "Koleksiyon yapısı storefront'ta nasıl sunulmalı",
      "Premium ürün anlatımı için PDP dili nasıl kurulur",
    ],
  },
  {
    id: "marka-ve-deneyim",
    title: "Marka ve Deneyim Rehberi",
    description: "Storefront güvenini ve editoryal dili besleyecek içerik omurgası.",
    targetKeywords: ["marka hikâyesi", "alışveriş deneyimi", "müşteri güveni"],
    suggestedClusters: [
      "Mağaza politikalarını güven veren dille anlatma",
      "Kargo ve iade metinleri neden dönüşümü etkiler",
      "Blog ile koleksiyon hikâyesi nasıl desteklenir",
      "Yorumlar ve sosyal kanıt nasıl güçlenir",
      "Yeni ziyaretçiyi markaya ısındıran landing mantığı",
    ],
  },
];

export const CONTENT_GUIDELINES = {
  pillar: {
    minWords: 1600,
    idealWords: 2200,
    description: "Ana konuyu güçlü şekilde sahiplenen referans içerik.",
  },
  cluster: {
    minWords: 900,
    idealWords: 1300,
    description: "Belirli bir ihtiyacı cevaplayan destekleyici yazı.",
  },
  standalone: {
    minWords: 600,
    idealWords: 900,
    description: "Tek başına değer üreten editoryal blog yazısı.",
  },
};

export const SEO_CHECKLIST = [
  { id: "title", label: "SEO Başlığı", weight: 15 },
  { id: "meta", label: "Meta Açıklama", weight: 10 },
  { id: "heading", label: "H1 Başlık", weight: 10 },
  { id: "subheadings", label: "H2/H3 Alt Başlıklar", weight: 10 },
  { id: "keyword", label: "Anahtar Kelime Kullanımı", weight: 15 },
  { id: "internal", label: "İç Link", weight: 10 },
  { id: "product", label: "Ürün Linki", weight: 10 },
  { id: "image", label: "Görsel ve Alt Metin", weight: 10 },
  { id: "wordcount", label: "Kelime Sayısı", weight: 10 },
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
