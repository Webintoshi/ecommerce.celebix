import { BlogCategoryInfo, BlogPost } from "@/types/blog";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export const BLOG_CATEGORIES: BlogCategoryInfo[] = [
  {
    id: "design",
    name: "Tasarin Notlari",
    slug: "tasarim-notlari",
    description: "Marka, urun ve deneyim tarafinda ilham veren notlar.",
    icon: "✦",
  },
  {
    id: "workshop",
    name: "Atolye",
    slug: "atolye",
    description: "Uretim kalitesi, malzeme ve iscilik odakli icerikler.",
    icon: "□",
  },
  {
    id: "guides",
    name: "Rehberler",
    slug: "rehberler",
    description: "Musterilerin karar surecini kolaylastiran detayli rehberler.",
    icon: "→",
  },
  {
    id: "stories",
    name: "Hikayeler",
    slug: "hikayeler",
    description: "Marka dili, koleksiyon cikislari ve editor notlari.",
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
    id: "marka-rehberi",
    title: "Marka ve Koleksiyon Rehberi",
    description: "Yeni bir magaza icin blog omurgasini kuracak pillar icerik fikirleri.",
    targetKeywords: ["marka rehberi", "koleksiyon rehberi", "urun secim rehberi"],
    suggestedClusters: [
      "Yeni sezonda hangi urun grubu one cikiyor?",
      "Dogru urun secimi icin 5 kritik ipucu",
      "Malzeme ve iscilik kalite farki nasil anlatilir?",
      "Musteriye guven veren PDP icerigi nasil yazilir?",
      "Koleksiyon hikayesi ile satis nasil desteklenir?",
    ],
  },
  {
    id: "alisveris-deneyimi",
    title: "Alisveris Deneyimi Rehberi",
    description: "Storefront ve musteri deneyimini destekleyen evergreen icerikler.",
    targetKeywords: ["online alisveris deneyimi", "urun rehberi", "musteri deneyimi"],
    suggestedClusters: [
      "Magaza politikalarini guven veren dille anlatma",
      "Sik sorulan sorular sayfasi nasil kurgulanir?",
      "Kargo ve iade icerikleri neden donusum etkiler?",
      "Hediye odakli urun sunumu nasil yapilir?",
      "Yorumlar ve sosyal kanit nasil guclendirilir?",
    ],
  },
];

export const CONTENT_GUIDELINES = {
  pillar: {
    minWords: 1800,
    idealWords: 2400,
    description: "Ana konu etrafinda guclu bir referans icerigi.",
  },
  cluster: {
    minWords: 900,
    idealWords: 1400,
    description: "Belirli bir alt ihtiyaci cevaplayan destekleyici yazi.",
  },
  standalone: {
    minWords: 600,
    idealWords: 900,
    description: "Tek basina deger ureten blog yazisi.",
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
  return BLOG_POSTS
    .filter((post) => post.category === category)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

export function getRelatedPosts(post: BlogPost, limit = 3): BlogPost[] {
  return BLOG_POSTS.filter((candidate) => candidate.category === post.category && candidate.id !== post.id)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit);
}

export function searchPosts(query: string): BlogPost[] {
  const q = query.toLowerCase();
  return BLOG_POSTS.filter((post) =>
    post.title.toLowerCase().includes(q) ||
    post.excerpt.toLowerCase().includes(q) ||
    post.tags.some((tag) => tag.toLowerCase().includes(q)),
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
