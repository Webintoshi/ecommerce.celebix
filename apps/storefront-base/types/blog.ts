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
  readTime: number;
  featured: boolean;
  views: number;
  status: ContentStatus;
  topicType: TopicType;
  pillarId: string | null;
  targetKeywords: string[];
  primaryKeyword: string;
  wordCount: number;
  seoScore: number;
  internalLinks: string[];
  relatedProducts: string[];
}

export type BlogCategory = "design" | "workshop" | "guides" | "stories" | "updates";

export interface BlogCategoryInfo {
  id: BlogCategory;
  name: string;
  slug: string;
  description: string;
  icon: string;
}
