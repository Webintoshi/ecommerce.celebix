"use client";

import { useState, useEffect } from "react";
import {
    BookOpen,
    Search,
    Filter,
    Plus,
    Clock,
    Type,
    Eye,
    Edit,
    Calendar,
    CheckCircle2,
    AlertCircle,
    ArrowLeft,
    Sparkles,
    Layers,
    Tag
} from "lucide-react";
import Link from "next/link";

interface ContentItem {
    id: string;
    title: string;
    slug: string;
    pillar: string;
    pillarName: string;
    description: string;
    wordCount: number;
    readingTime: number;
    status: "draft" | "published" | "archived";
    publishedAt: string | null;
    updatedAt: string;
    primaryKeyword: string;
    secondaryKeywords: string[];
}

interface ContentStats {
    total: number;
    published: number;
    draft: number;
    avgWordCount: number;
}

const MOCK_CONTENT: ContentItem[] = [
    {
        id: "1",
        title: "Core Web Vitals Nedir? Tam Rehber 2024",
        slug: "core-web-vitals",
        pillar: "teknik-seo",
        pillarName: "Teknik SEO",
        description: "LCP, INP ve CLS metriklerinin detaylı açıklaması ve optimizasyon stratejileri.",
        wordCount: 2800,
        readingTime: 14,
        status: "published",
        publishedAt: "2024-02-15",
        updatedAt: "2024-02-15",
        primaryKeyword: "core web vitals",
        secondaryKeywords: ["lcp", "inp", "cls", "sayfa hızı", "google ranking"]
    },
    {
        id: "2",
        title: "Site Hızı Optimizasyonu: 10 Pratik İpucu",
        slug: "site-hizi",
        pillar: "teknik-seo",
        pillarName: "Teknik SEO",
        description: "Web sitenizi hızlandırmak için image optimizasyonu, CDN ve caching stratejileri.",
        wordCount: 2200,
        readingTime: 11,
        status: "published",
        publishedAt: "2024-02-10",
        updatedAt: "2024-02-10",
        primaryKeyword: "site hızı optimizasyonu",
        secondaryKeywords: ["image optimizasyonu", "cdn", "browser caching", "lazy loading"]
    },
    {
        id: "3",
        title: "Taranabilirlik ve Crawl Budget Yönetimi",
        slug: "taranabilirlik",
        pillar: "teknik-seo",
        pillarName: "Teknik SEO",
        description: "robots.txt, XML sitemap ve canonical etiketleri ile taranabilirliği artırma.",
        wordCount: 2500,
        readingTime: 12,
        status: "published",
        publishedAt: "2024-02-05",
        updatedAt: "2024-02-05",
        primaryKeyword: "crawl budget",
        secondaryKeywords: ["robots.txt", "xml sitemap", "canonical", "taranabilirlik"]
    },
    {
        id: "4",
        title: "Anahtar Kelime Araştırması: Baştan Sona Rehber",
        slug: "anahtar-kelime-arastirmasi",
        pillar: "sayfa-ici-seo",
        pillarName: "Sayfa İçi SEO",
        description: "Uzun kuyruklu anahtar kelimeler bulma ve search intent analizi teknikleri.",
        wordCount: 3200,
        readingTime: 16,
        status: "published",
        publishedAt: "2024-01-28",
        updatedAt: "2024-01-28",
        primaryKeyword: "anahtar kelime araştırması",
        secondaryKeywords: ["long-tail keywords", "search intent", "keyword mapping", "serp analizi"]
    },
    {
        id: "5",
        title: "GEO Rehberi: LLM'ler İçin İçerik Optimizasyonu",
        slug: "geo-rehberi",
        pillar: "ai-seo",
        pillarName: "AI SEO",
        description: "ChatGPT ve Perplexity gibi yapay zeka araçlarında görünür olma stratejileri.",
        wordCount: 4200,
        readingTime: 21,
        status: "published",
        publishedAt: "2024-01-20",
        updatedAt: "2024-01-20",
        primaryKeyword: "generative engine optimization",
        secondaryKeywords: ["llm seo", "chatgpt citations", "ai search", "geo"]
    }
];

export default function ContentManagementPage() {
    const [contents, setContents] = useState<ContentItem[]>([]);
    const [stats, setStats] = useState<ContentStats>({ total: 0, published: 0, draft: 0, avgWordCount: 0 });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft" | "archived">("all");
    const [pillarFilter, setPillarFilter] = useState<string>("all");

    useEffect(() => {
        loadContentData();
    }, []);

    const loadContentData = async () => {
        setLoading(true);
        try {
            // Gerçek uygulamada API'den çekilecek
            // const response = await fetch("/api/seo-hub/content");
            // const data = await response.json();
            
            // Mock data kullanıyoruz
            setContents(MOCK_CONTENT);
            
            setStats({
                total: MOCK_CONTENT.length,
                published: MOCK_CONTENT.filter(c => c.status === "published").length,
                draft: MOCK_CONTENT.filter(c => c.status === "draft").length,
                avgWordCount: Math.round(MOCK_CONTENT.reduce((acc, c) => acc + c.wordCount, 0) / MOCK_CONTENT.length)
            });
        } catch (error) {
            console.error("Error loading content:", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredContents = contents.filter(content => {
        const matchesSearch = content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            content.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            content.primaryKeyword.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || content.status === statusFilter;
        const matchesPillar = pillarFilter === "all" || content.pillar === pillarFilter;
        return matchesSearch && matchesStatus && matchesPillar;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "published":
                return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Yayında</span>;
            case "draft":
                return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">Taslak</span>;
            case "archived":
                return <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">Arşiv</span>;
            default:
                return null;
        }
    };

    const uniquePillars = Array.from(new Set(contents.map(c => c.pillar)));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <Link href="/admin/seo-killer" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2">
                    <ArrowLeft className="w-4 h-4" />
                    SEO Merkezi
                </Link>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <BookOpen className="w-7 h-7 text-orange-600" />
                            İçerik Yönetimi
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Blog yazıları, rehberler ve SEO içeriklerini yönetin.
                        </p>
                    </div>
                    <Link
                        href="/admin/seo-hub"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Yeni İçerik
                    </Link>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                    <div className="text-sm text-gray-500">Toplam İçerik</div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-2xl font-bold text-green-600">{stats.published}</div>
                    <div className="text-sm text-gray-500">Yayında</div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-2xl font-bold text-yellow-600">{stats.draft}</div>
                    <div className="text-sm text-gray-500">Taslak</div>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-2xl font-bold text-purple-600">{stats.avgWordCount}</div>
                    <div className="text-sm text-gray-500">Ort. Kelime</div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[250px]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="İçerik ara..."
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                            />
                        </div>
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    >
                        <option value="all">Tüm Durumlar</option>
                        <option value="published">Yayında</option>
                        <option value="draft">Taslak</option>
                        <option value="archived">Arşiv</option>
                    </select>
                    <select
                        value={pillarFilter}
                        onChange={(e) => setPillarFilter(e.target.value)}
                        className="px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    >
                        <option value="all">Tüm Pillarlar</option>
                        {uniquePillars.map(pillar => (
                            <option key={pillar} value={pillar}>
                                {contents.find(c => c.pillar === pillar)?.pillarName}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Content List */}
            {loading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse bg-gray-200 rounded-xl h-32" />
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredContents.map(content => (
                        <div key={content.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                            <div className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            {getStatusBadge(content.status)}
                                            <Link 
                                                href={`/seo/${content.pillar}/${content.slug}`}
                                                target="_blank"
                                                className="text-xs text-gray-500 hover:text-orange-600 flex items-center gap-1"
                                            >
                                                <Layers className="w-3 h-3" />
                                                {content.pillarName}
                                            </Link>
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                            {content.title}
                                        </h3>
                                        <p className="text-sm text-gray-600 line-clamp-2">
                                            {content.description}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-4">
                                        <Link
                                            href={`/seo/${content.pillar}/${content.slug}`}
                                            target="_blank"
                                            className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                            title="Görüntüle"
                                        >
                                            <Eye className="w-5 h-5" />
                                        </Link>
                                        <Link
                                            href={`/admin/seo-hub/pillars`}
                                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Düzenle"
                                        >
                                            <Edit className="w-5 h-5" />
                                        </Link>
                                    </div>
                                </div>

                                {/* Meta Info */}
                                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <Type className="w-3 h-3" />
                                        {content.wordCount.toLocaleString()} kelime
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {content.readingTime} dk okuma
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Sparkles className="w-3 h-3 text-orange-500" />
                                        {content.primaryKeyword}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(content.updatedAt).toLocaleDateString("tr-TR")}
                                    </span>
                                    {content.secondaryKeywords.length > 0 && (
                                        <div className="flex items-center gap-1">
                                            <Tag className="w-3 h-3" />
                                            <span className="text-gray-400">
                                                {content.secondaryKeywords.slice(0, 3).join(", ")}
                                                {content.secondaryKeywords.length > 3 && ` +${content.secondaryKeywords.length - 3}`}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && filteredContents.length === 0 && (
                <div className="text-center py-12">
                    <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">
                        {searchQuery || statusFilter !== "all" || pillarFilter !== "all"
                            ? "Arama kriterlerine uygun içerik bulunamadı."
                            : "Henüz içerik oluşturulmamış."}
                    </p>
                </div>
            )}
        </div>
    );
}
