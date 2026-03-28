"use client";

import { useState, useEffect } from "react";
import {
    Rocket,
    Package,
    FolderOpen,
    FileText,
    AlertCircle,
    ChevronRight,
    Star,
    Target,
    Zap
} from "lucide-react";
import Link from "next/link";

function calculateScore(hasTitle: boolean, hasDesc: boolean, hasImage: boolean): number {
    let score = 0;
    if (hasTitle) score += 40;
    if (hasDesc) score += 40;
    if (hasImage) score += 20;
    return score;
}

function ScoreBadge({ score }: { score: number }) {
    let color = "bg-red-500";
    let text = "Geliştirilmeli";
    if (score >= 80) {
        color = "bg-green-500";
        text = "Harika!";
    } else if (score >= 60) {
        color = "bg-yellow-500";
        text = "İyi";
    }
    
    return (
        <div className="flex items-center gap-3">
            <div className={`w-16 h-16 rounded-full ${color} flex items-center justify-center text-white font-bold text-2xl`}>
                {score}
            </div>
            <div>
                <div className="font-semibold text-gray-900 text-lg">{text}</div>
                <div className="text-sm text-gray-500">Genel SEO Puanı</div>
            </div>
        </div>
    );
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return (
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div 
                className={`h-full transition-all duration-500 ${
                    percent >= 80 ? "bg-green-500" : percent >= 50 ? "bg-yellow-500" : "bg-red-500"
                }`}
                style={{ width: `${percent}%` }}
            />
        </div>
    );
}

function BigCard({ 
    href, 
    icon: Icon, 
    color,
    title, 
    subtitle,
    count,
    completed
}: { 
    href: string; 
    icon: any; 
    color: string;
    title: string; 
    subtitle: string;
    count: number;
    completed: number;
}) {
    const percent = count > 0 ? Math.round((completed / count) * 100) : 0;
    
    return (
        <Link href={href} className="group block">
            <div className="bg-white rounded-2xl p-8 shadow-sm border-2 border-gray-100 hover:border-blue-300 hover:shadow-xl transition-all h-full">
                <div className="flex items-start justify-between mb-6">
                    <div className={`w-16 h-16 rounded-xl ${color} flex items-center justify-center shadow-lg`}>
                        <Icon className="w-8 h-8 text-white" />
                    </div>
                    <ChevronRight className="w-6 h-6 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
                
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 mb-6">{subtitle}</p>
                
                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tamamlanan</span>
                        <span className="font-semibold text-gray-900">{completed} / {count}</span>
                    </div>
                    <ProgressBar completed={completed} total={count} />
                    <div className="text-right text-xs text-gray-400">%{percent} tamamlandı</div>
                </div>
            </div>
        </Link>
    );
}

export default function SEODashboard() {
    const [stats, setStats] = useState({
        products: { total: 0, completed: 0, avgScore: 0 },
        categories: { total: 0, completed: 0, avgScore: 0 },
        pages: { total: 0, completed: 0, avgScore: 0 },
        overallScore: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const productsRes = await fetch("/api/products");
            const productsData = await productsRes.json();
            const products = productsData.products || [];
            
            const categoriesRes = await fetch("/api/categories");
            const categoriesData = await categoriesRes.json();
            const categories = categoriesData.categories || [];

            let productCompleted = 0;
            let productTotalScore = 0;
            products.forEach((p: any) => {
                const hasTitle = p.seo_title || p.meta_title;
                const hasDesc = p.seo_description || p.meta_description;
                const hasImage = p.images && p.images.length > 0;
                const score = calculateScore(!!hasTitle, !!hasDesc, hasImage);
                productTotalScore += score;
                if (score >= 60) productCompleted++;
            });

            let categoryCompleted = 0;
            let categoryTotalScore = 0;
            categories.forEach((c: any) => {
                const hasTitle = c.seo_title;
                const hasDesc = c.seo_description;
                const score = calculateScore(!!hasTitle, !!hasDesc, true);
                categoryTotalScore += score;
                if (score >= 60) categoryCompleted++;
            });

            const staticPages = [
                { name: "Ana Sayfa", hasTitle: true, hasDesc: true },
                { name: "Hakkımızda", hasTitle: true, hasDesc: true },
                { name: "İletişim", hasTitle: true, hasDesc: true },
                { name: "SSS", hasTitle: true, hasDesc: true },
                { name: "Gizlilik", hasTitle: false, hasDesc: false },
                { name: "Şartlar", hasTitle: false, hasDesc: false },
            ];
            
            let pageCompleted = 0;
            let pageTotalScore = 0;
            staticPages.forEach((p: any) => {
                const score = calculateScore(p.hasTitle, p.hasDesc, true);
                pageTotalScore += score;
                if (score >= 60) pageCompleted++;
            });

            const productAvg = products.length > 0 ? Math.round(productTotalScore / products.length) : 0;
            const categoryAvg = categories.length > 0 ? Math.round(categoryTotalScore / categories.length) : 0;
            const pageAvg = Math.round(pageTotalScore / staticPages.length);
            const overall = Math.round((productAvg + categoryAvg + pageAvg) / 3);

            setStats({
                products: {
                    total: products.length,
                    completed: productCompleted,
                    avgScore: productAvg
                },
                categories: {
                    total: categories.length,
                    completed: categoryCompleted,
                    avgScore: categoryAvg
                },
                pages: {
                    total: staticPages.length,
                    completed: pageCompleted,
                    avgScore: pageAvg
                },
                overallScore: overall
            });
        } catch (error) {
            console.error("Error loading data:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-pulse text-center">
                    <Rocket className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-bounce" />
                    <p className="text-gray-600">Yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
            <div className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-8">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                            <Rocket className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">SEO Merkezi</h1>
                            <p className="text-gray-500">Google'da üst sıralara çık!</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center gap-4">
                            <ScoreBadge score={stats.overallScore} />
                        </div>
                    </div>
                    
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <div className="text-3xl font-bold text-blue-600">{stats.products.total}</div>
                        <div className="text-gray-500">Toplam Ürün</div>
                        <div className="text-sm text-green-600 mt-1">{stats.products.completed} tamamlandı</div>
                    </div>
                    
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <div className="text-3xl font-bold text-purple-600">{stats.categories.total}</div>
                        <div className="text-gray-500">Toplam Kategori</div>
                        <div className="text-sm text-green-600 mt-1">{stats.categories.completed} tamamlandı</div>
                    </div>
                    
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <div className="text-3xl font-bold text-green-600">{stats.pages.total}</div>
                        <div className="text-gray-500">Toplam Sayfa</div>
                        <div className="text-sm text-green-600 mt-1">{stats.pages.completed} tamamlandı</div>
                    </div>
                </div>

                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    Neyi Düzenlemek İstiyorsun?
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <BigCard
                        href="/admin/seo-killer/urunler"
                        icon={Package}
                        color="bg-blue-500"
                        title="Ürünlerim"
                        subtitle="Satışta olan ürünlerinin SEO ayarları"
                        count={stats.products.total}
                        completed={stats.products.completed}
                    />
                    
                    <BigCard
                        href="/admin/seo-killer/kategoriler"
                        icon={FolderOpen}
                        color="bg-purple-500"
                        title="Kategorilerim"
                        subtitle="Kategori sayfalarının SEO ayarları"
                        count={stats.categories.total}
                        completed={stats.categories.completed}
                    />
                    
                    <BigCard
                        href="/admin/seo-killer/sayfalar"
                        icon={FileText}
                        color="bg-green-500"
                        title="Sayfalarım"
                        subtitle="Ana sayfa, hakkımızda, iletişim vb."
                        count={stats.pages.total}
                        completed={stats.pages.completed}
                    />
                </div>

                {(stats.products.total - stats.products.completed > 0 || 
                  stats.categories.total - stats.categories.completed > 0 ||
                  stats.pages.total - stats.pages.completed > 0) && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-orange-500" />
                            Yapılacaklar
                        </h3>
                        
                        <div className="space-y-3">
                            {stats.products.total - stats.products.completed > 0 && (
                                <Link href="/admin/seo-killer/urunler" className="flex items-center justify-between p-4 bg-red-50 rounded-xl hover:bg-red-100 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                            <Package className="w-5 h-5 text-red-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{stats.products.total - stats.products.completed} ürüne SEO ayarı gerekli</p>
                                            <p className="text-sm text-gray-500">Başlık ve açıklama eklenmemiş</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-red-400" />
                                </Link>
                            )}
                            
                            {stats.categories.total - stats.categories.completed > 0 && (
                                <Link href="/admin/seo-killer/kategoriler" className="flex items-center justify-between p-4 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                            <FolderOpen className="w-5 h-5 text-orange-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{stats.categories.total - stats.categories.completed} kategoriye SEO ayarı gerekli</p>
                                            <p className="text-sm text-gray-500">Başlık ve açıklama eklenmemiş</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-orange-400" />
                                </Link>
                            )}
                            
                            {stats.pages.total - stats.pages.completed > 0 && (
                                <Link href="/admin/seo-killer/sayfalar" className="flex items-center justify-between p-4 bg-green-50 rounded-xl hover:bg-green-100 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                            <FileText className="w-5 h-5 text-green-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-900">{stats.pages.total - stats.pages.completed} sayfaya SEO ayarı gerekli</p>
                                            <p className="text-sm text-gray-500">Başlık ve açıklama eklenmemiş</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-green-400" />
                                </Link>
                            )}
                        </div>
                    </div>
                )}

                {stats.overallScore >= 80 && (
                    <div className="bg-green-50 rounded-2xl p-6 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Star className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-green-900 mb-2">Harika İş Çıkardın!</h3>
                        <p className="text-green-700">SEO ayarlarını çok iyi yaptın. Google'da üst sıralara çıkmaya hazırsın!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
