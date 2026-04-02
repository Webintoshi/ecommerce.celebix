import type { BlogPost } from "@/types/blog";

export interface BlogStrategyCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  productCount: number;
}

export interface BlogStrategyPillar {
  id: string;
  title: string;
  description: string;
  targetKeywords: string[];
  suggestedClusters: string[];
  categoryId: string | null;
  productCount: number;
  existingPillarPostId: string | null;
  existingClusterCount: number;
}

export interface BlogStrategyProgressBucket {
  total: number;
  target?: number;
}

export interface BlogStrategySnapshot {
  posts: BlogPost[];
  categories: BlogStrategyCategory[];
  suggestedPillars: BlogStrategyPillar[];
  progress: {
    pillar: BlogStrategyProgressBucket;
    cluster: BlogStrategyProgressBucket;
    standalone: BlogStrategyProgressBucket;
  };
  contentGuidelines: {
    pillar: {
      minWords: number;
      idealWords: number;
      description: string;
    };
    cluster: {
      minWords: number;
      idealWords: number;
      description: string;
    };
    standalone: {
      minWords: number;
      idealWords: number;
      description: string;
    };
  };
  storeContext: {
    name: string;
    slug: string;
    totalProducts: number;
    totalCategories: number;
    totalPosts: number;
    focusTerms: string[];
  };
}

export interface BlogStrategyApiResponse {
  success: boolean;
  snapshot?: BlogStrategySnapshot;
  error?: string;
}
