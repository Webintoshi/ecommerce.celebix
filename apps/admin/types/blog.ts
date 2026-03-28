export type TopicType = "pillar" | "cluster" | "standalone";
export type ContentStatus = "draft" | "published" | "archived";

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: {
    name: string;
    avatar: string;
    role: string;
  };
  category: BlogCategory;
  tags: string[];
  publishedAt: Date;
  updatedAt: Date;
  readTime: number; // dakika
  featured: boolean;
  views: number;
  status: ContentStatus;
  // SEO Hub - Topical Authority alanları
  topicType: TopicType;
  pillarId: string | null;        // Eğer cluster ise hangi pillar'a bağlı
  targetKeywords: string[];       // Hedef anahtar kelimeler
  primaryKeyword: string;         // Ana hedef kelime
  wordCount: number;              // Kelime sayısı
  seoScore: number;               // SEO puanı (0-100)
  internalLinks: string[];        // Bağlantı verdiği diğer yazıların ID'leri
  relatedProducts: string[];      // İlgili ürün ID'leri (ezme ürünleri)
}

export type BlogCategory =
  | "saglik"
  | "tarifler"
  | "beslenme"
  | "yasam"
  | "haberler";

export interface BlogCategoryInfo {
  id: BlogCategory;
  name: string;
  slug: string;
  description: string;
  icon: string;
}
