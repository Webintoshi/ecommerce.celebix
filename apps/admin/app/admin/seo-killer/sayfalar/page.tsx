"use client";

import { useState, useEffect, useCallback } from "react";
import {
    FileText,
    Save,
    Eye,
    Code,
    Sparkles,
    CheckCircle2,
    AlertTriangle,
    Globe,
    Home,
    HelpCircle,
    Mail,
    BookOpen,
    Info,
    Loader2,
    RefreshCw
} from "lucide-react";
import Link from "next/link";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import type { 
    StaticPage, 
    PageSEOViewModel, 
    PageFAQ,
    PageApiResponse 
} from "@/types/page";
import { toPageSEOViewModel, DEFAULT_PAGES } from "@/types/page";

// ============================================================================
// TYPES & DEFAULTS
// ============================================================================

interface EditFormState {
    metaTitle: string;
    metaDescription: string;
    faq: PageFAQ[];
    keyTakeaways: string[];
}

interface MessageState {
    type: "success" | "error";
    text: string;
}

type SectionType = "meta" | "faq" | "geo";

const EMPTY_FORM_STATE: EditFormState = {
    metaTitle: "",
    metaDescription: "",
    faq: [],
    keyTakeaways: []
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Home,
    Globe,
    BookOpen,
    Mail,
    HelpCircle,
    Info,
};

// ============================================================================
// API CLIENT
// ============================================================================

async function fetchPages(): Promise<StaticPage[]> {
    const response = await fetch("/api/pages", { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || "Failed to fetch pages");
    }

    // Normalize pages with null checks
    const pages = (data.pages || []).map((p: any) => ({
        ...p,
        seo_keywords: p.seo_keywords || [],
        faq: p.faq || [],
        geo_data: p.geo_data || { keyTakeaways: [], entities: [] }
    }));

    return pages;
}

async function updatePage(
    id: string,
    slug: string, 
    formState: EditFormState
): Promise<StaticPage> {
    const payload = {
        id,
        seo_title: formState.metaTitle,
        seo_description: formState.metaDescription,
        faq: formState.faq,
        geo_data: { 
            keyTakeaways: formState.keyTakeaways, 
            entities: ["WebPage", "Organization"] 
        }
    };

    const response = await fetch("/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: PageApiResponse = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || "Failed to update page");
    }

    // Trigger revalidation
    try {
        const path = slug === '' ? '/' : `/${slug}`;
        await fetch("/api/revalidate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path })
        });
    } catch {
        console.warn("Revalidation failed");
    }

    return data.page!;
}

async function generateWithAI(page: PageSEOViewModel): Promise<Partial<EditFormState>> {
    const response = await fetch("/api/seo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            type: "page",
            name: page.name,
            description: page.metaDescription,
        }),
    });

    if (!response.ok) {
        throw new Error(`AI generation failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || "AI generation failed");
    }

    return {
        metaTitle: data.metaTitle || "",
        metaDescription: data.metaDescription || "",
    };
}

async function generatePageFAQWithAI(page: PageSEOViewModel): Promise<{faq: PageFAQ[]}> {
    const response = await fetch("/api/seo/page-faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: page.name,
            url: page.url,
            description: page.metaDescription,
        }),
    });

    if (!response.ok) {
        throw new Error(`AI FAQ generation failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || "AI FAQ generation failed");
    }

    return {
        faq: data.faq || [],
    };
}

async function generatePageGEOWithAI(page: PageSEOViewModel): Promise<{takeaways: string[]}> {
    const response = await fetch("/api/seo/page-geo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: page.name,
            url: page.url,
            description: page.metaDescription,
        }),
    });

    if (!response.ok) {
        throw new Error(`AI GEO generation failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || "AI GEO generation failed");
    }

    return {
        takeaways: data.takeaways || [],
    };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PageSEOPage() {
    const [pages, setPages] = useState<PageSEOViewModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [editForm, setEditForm] = useState<EditFormState>(EMPTY_FORM_STATE);
    const [message, setMessage] = useState<MessageState | null>(null);
    const [generating, setGenerating] = useState(false);
    const [generatingFAQ, setGeneratingFAQ] = useState(false);
    const [generatingGEO, setGeneratingGEO] = useState(false);
    const [activeSection, setActiveSection] = useState<SectionType>("meta");
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadPages = useCallback(async (showRefresh = false) => {
        if (showRefresh) setIsRefreshing(true);
        else setLoading(true);
        
        setMessage(null);

        try {
            const rawPages = await fetchPages();
            const viewModels = rawPages.map(p => toPageSEOViewModel(p));
            setPages(viewModels);
        } catch (error) {
            console.error("Error loading pages:", error);
            setMessage({ 
                type: "error", 
                text: error instanceof Error ? error.message : "Sayfalar yüklenirken hata oluştu." 
            });
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadPages();
    }, [loadPages]);

    const handleEdit = useCallback((page: PageSEOViewModel) => {
        setEditingId(page.id);
        setEditForm({
            metaTitle: page.metaTitle,
            metaDescription: page.metaDescription,
            faq: page.faq || [],
            keyTakeaways: page.geo?.keyTakeaways || []
        });
        setActiveSection("meta");
        setMessage(null);
    }, []);

    const handleCancel = useCallback(() => {
        setEditingId(null);
        setEditForm(EMPTY_FORM_STATE);
        setMessage(null);
    }, []);

    const handleSave = useCallback(async (pageId: string, pageSlug: string) => {
        setSaving(true);
        setMessage(null);

        try {
            const updatedPage = await updatePage(pageId, pageSlug, editForm);
            
            setPages(prev => prev.map(p =>
                p.id === pageId ? toPageSEOViewModel(updatedPage) : p
            ));
            
            setMessage({ type: "success", text: "Sayfa SEO bilgileri kaydedildi! Cache temizlendi." });
            setEditingId(null);
            setEditForm(EMPTY_FORM_STATE);
        } catch (error) {
            console.error("Save error:", error);
            setMessage({ 
                type: "error", 
                text: error instanceof Error ? error.message : "Kayıt başarısız oldu." 
            });
        } finally {
            setSaving(false);
        }
    }, [editForm]);

    const handleGenerateAI = useCallback(async (page: PageSEOViewModel) => {
        setGenerating(true);
        setMessage(null);

        try {
            const generated = await generateWithAI(page);
            
            setEditForm(prev => ({
                ...prev,
                metaTitle: generated.metaTitle || prev.metaTitle,
                metaDescription: generated.metaDescription || prev.metaDescription,
            }));
            
            setMessage({ type: "success", text: "Toshi AI ile oluşturuldu!" });
        } catch (error) {
            console.error("AI generation failed:", error);
            setMessage({ 
                type: "error", 
                text: error instanceof Error ? error.message : "AI oluşturma başarısız." 
            });
        } finally {
            setGenerating(false);
        }
    }, []);

    const handleGenerateFAQ = useCallback(async (page: PageSEOViewModel) => {
        setGeneratingFAQ(true);
        setMessage(null);

        try {
            const generated = await generatePageFAQWithAI(page);
            
            setEditForm(prev => ({
                ...prev,
                faq: [...prev.faq, ...generated.faq]
            }));
            
            setMessage({
                type: "success",
                text: `Toshi ${generated.faq.length} adet sayfa FAQ'sı oluşturdu!`
            });
        } catch (error) {
            console.error("FAQ generation failed:", error);
            setMessage({ 
                type: "error", 
                text: error instanceof Error ? error.message : "FAQ oluşturma başarısız." 
            });
        } finally {
            setGeneratingFAQ(false);
        }
    }, []);

    const handleGenerateGEO = useCallback(async (page: PageSEOViewModel) => {
        setGeneratingGEO(true);
        setMessage(null);

        try {
            const generated = await generatePageGEOWithAI(page);
            
            setEditForm(prev => ({
                ...prev,
                keyTakeaways: [...prev.keyTakeaways, ...generated.takeaways]
            }));
            
            setMessage({
                type: "success",
                text: `Toshi ${generated.takeaways.length} adet GEO çıkarımı oluşturdu!`
            });
        } catch (error) {
            console.error("GEO generation failed:", error);
            setMessage({ 
                type: "error", 
                text: error instanceof Error ? error.message : "GEO oluşturma başarısız." 
            });
        } finally {
            setGeneratingGEO(false);
        }
    }, []);

    // Form handlers
    const updateMetaTitle = useCallback((value: string) => {
        setEditForm(prev => ({ ...prev, metaTitle: value }));
    }, []);

    const updateMetaDescription = useCallback((value: string) => {
        setEditForm(prev => ({ ...prev, metaDescription: value }));
    }, []);

    const addFAQ = useCallback(() => {
        setEditForm(prev => ({
            ...prev,
            faq: [...prev.faq, { question: "", answer: "" }]
        }));
    }, []);

    const updateFAQ = useCallback((index: number, field: keyof PageFAQ, value: string) => {
        setEditForm(prev => ({
            ...prev,
            faq: prev.faq.map((f, i) => i === index ? { ...f, [field]: value } : f)
        }));
    }, []);

    const removeFAQ = useCallback((index: number) => {
        setEditForm(prev => ({
            ...prev,
            faq: prev.faq.filter((_, i) => i !== index)
        }));
    }, []);

    const addKeyTakeaway = useCallback(() => {
        setEditForm(prev => ({
            ...prev,
            keyTakeaways: [...prev.keyTakeaways, ""]
        }));
    }, []);

    const updateKeyTakeaway = useCallback((index: number, value: string) => {
        setEditForm(prev => ({
            ...prev,
            keyTakeaways: prev.keyTakeaways.map((k, i) => i === index ? value : k)
        }));
    }, []);

    const removeKeyTakeaway = useCallback((index: number) => {
        setEditForm(prev => ({
            ...prev,
            keyTakeaways: prev.keyTakeaways.filter((_, i) => i !== index)
        }));
    }, []);

    const storeBaseUrl = STORE_RUNTIME.storefrontUrl.replace(/\/$/, "");
    const storeHost = storeBaseUrl.replace(/^https?:\/\//, "");

    const generateSchemaPreview = (page: PageSEOViewModel) => ({
        "@context": "https://schema.org",
        "@type": page.schema_type,
        "name": page.name,
        "description": page.metaDescription,
        "url": `${storeBaseUrl}${page.url}`
    });

    const getIcon = (iconName: string) => {
        const Icon = ICON_MAP[iconName] || FileText;
        return <Icon className="w-5 h-5" />;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FileText className="w-7 h-7 text-orange-600" />
                        Sayfa SEO Yönetimi
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Statik sayfalar için meta bilgilerini düzenleyin.
                    </p>
                </div>
                <button
                    onClick={() => loadPages(true)}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Yenile
                </button>
            </div>

            {/* Messages */}
            {message && (
                <div className={`p-4 rounded-[8px] flex items-center gap-3 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                    {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    <span>{message.text}</span>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="ml-3 text-gray-600">Sayfalar yükleniyor...</span>
                </div>
            )}

            {/* Pages List */}
            {!loading && pages.map((page) => (
                <div key={page.id} className="bg-white rounded-[8px] shadow-sm border border-gray-100 overflow-hidden">
                    {/* Card Header */}
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-50 rounded-lg text-orange-600">
                                {getIcon(page.icon || 'FileText')}
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">{page.name}</h3>
                                <p className="text-sm text-gray-500">{page.url}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${page.score >= 80 ? 'bg-green-100 text-green-700' : page.score >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                        SEO: {page.score}/100
                                    </span>
                                    {page.issues.length > 0 && (
                                        <span className="text-xs text-orange-600">{page.issues.length} sorun</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-50 text-orange-700">
                                {page.schema_type}
                            </span>
                            {editingId !== page.id && (
                                <button
                                    onClick={() => handleEdit(page)}
                                    className="px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                >
                                    Düzenle
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Edit Form */}
                    {editingId === page.id && (
                        <div className="p-4 space-y-4 bg-gray-50">
                            {/* Tabs */}
                            <div className="flex gap-2 border-b border-gray-200">
                                <TabButton active={activeSection === "meta"} onClick={() => setActiveSection("meta")} label="Meta Bilgileri" />
                                <TabButton active={activeSection === "faq"} onClick={() => setActiveSection("faq")} label="FAQ Schema" badge={editForm.faq.length} />
                                <TabButton active={activeSection === "geo"} onClick={() => setActiveSection("geo")} label="GEO/LLM" />
                            </div>

                            {/* Meta Section */}
                            {activeSection === "meta" && (
                                <MetaSection
                                    page={page}
                                    editForm={editForm}
                                    isGenerating={generating}
                                    isSaving={saving}
                                    storeHost={storeHost}
                                    onUpdateMetaTitle={updateMetaTitle}
                                    onUpdateMetaDescription={updateMetaDescription}
                                    onGenerateAI={() => handleGenerateAI(page)}
                                    onSave={() => handleSave(page.id, page.slug)}
                                    onCancel={handleCancel}
                                    generateSchemaPreview={generateSchemaPreview}
                                />
                            )}

                            {/* FAQ Section */}
                            {activeSection === "faq" && (
                                <FAQSection
                                    faq={editForm.faq}
                                    onAdd={addFAQ}
                                    onUpdate={updateFAQ}
                                    onRemove={removeFAQ}
                                    onGenerateAI={() => handleGenerateFAQ(page)}
                                    isGenerating={generatingFAQ}
                                    onSave={() => handleSave(page.id, page.slug)}
                                    onCancel={handleCancel}
                                    isSaving={saving}
                                />
                            )}

                            {/* GEO Section */}
                            {activeSection === "geo" && (
                                <GEOSection
                                    keyTakeaways={editForm.keyTakeaways}
                                    onAdd={addKeyTakeaway}
                                    onUpdate={updateKeyTakeaway}
                                    onRemove={removeKeyTakeaway}
                                    onGenerateAI={() => handleGenerateGEO(page)}
                                    isGenerating={generatingGEO}
                                    onSave={() => handleSave(page.id, page.slug)}
                                    onCancel={handleCancel}
                                    isSaving={saving}
                                />
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TabButton({ active, onClick, label, badge }: { active: boolean; onClick: () => void; label: string; badge?: number }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${active ? "border-primary text-primary" : "border-transparent text-gray-600 hover:text-gray-900"}`}
        >
            <span className="flex items-center gap-1">
                {label}
                {badge !== undefined && badge > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded-full">{badge}</span>
                )}
            </span>
        </button>
    );
}

function MetaSection({ page, editForm, isGenerating, isSaving, storeHost, onUpdateMetaTitle, onUpdateMetaDescription, onGenerateAI, onSave, onCancel, generateSchemaPreview }: any) {
    const titleLength = editForm.metaTitle.length;
    const descLength = editForm.metaDescription.length;
    
    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Meta Başlık
                        <span className={`ml-2 text-xs ${titleLength >= 30 && titleLength <= 60 ? 'text-green-600' : 'text-orange-600'}`}>({titleLength}/60)</span>
                    </label>
                    <input
                        type="text"
                        value={editForm.metaTitle}
                        onChange={(e) => onUpdateMetaTitle(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                        maxLength={60}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Meta Açıklama
                        <span className={`ml-2 text-xs ${descLength >= 120 && descLength <= 160 ? 'text-green-600' : 'text-orange-600'}`}>({descLength}/160)</span>
                    </label>
                    <textarea
                        value={editForm.metaDescription}
                        onChange={(e) => onUpdateMetaDescription(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                        rows={3}
                        maxLength={160}
                    />
                </div>
            </div>

            {/* Google Preview */}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Eye className="w-3 h-3" /> Google Önizleme</div>
                <div className="space-y-1">
                    <div className="text-blue-700 text-lg hover:underline cursor-pointer truncate">{editForm.metaTitle || page.name}</div>
                    <div className="text-green-700 text-sm">{storeHost}{page.url}</div>
                    <div className="text-gray-600 text-sm line-clamp-2">{editForm.metaDescription}</div>
                </div>
            </div>

            {/* Schema Preview */}
            <details className="bg-white rounded-lg border border-gray-200">
                <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-gray-700 flex items-center gap-2"><Code className="w-4 h-4" /> Schema.org Önizleme</summary>
                <pre className="p-4 text-xs overflow-x-auto bg-gray-900 text-green-400 rounded-b-lg max-h-64">{JSON.stringify(generateSchemaPreview(page), null, 2)}</pre>
            </details>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
                <button onClick={onGenerateAI} disabled={isGenerating} className="flex items-center gap-2.5 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {isGenerating ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Toshi hazırlıyor...</span>
                        </>
                    ) : (
                        <>
                            <span className="flex items-center justify-center w-5 h-5 bg-white/10 rounded text-xs font-semibold">T</span>
                            <span>Toshi ile Oluştur</span>
                        </>
                    )}
                </button>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">İptal</button>
                    <button onClick={onSave} disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isSaving ? "Kaydediliyor..." : "Kaydet"}
                    </button>
                </div>
            </div>
        </>
    );
}

function FAQSection({ faq, onAdd, onUpdate, onRemove, onGenerateAI, isGenerating, onSave, onCancel, isSaving }: any) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="font-medium text-gray-900">Sıkça Sorulan Sorular</h4>
                    <p className="text-sm text-gray-500">Google FAQ rich snippet için</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onGenerateAI} 
                        disabled={isGenerating}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGenerating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <span className="flex items-center justify-center w-5 h-5 bg-white/10 rounded text-xs font-semibold">T</span>
                        )}
                        <span>{isGenerating ? "Toshi hazırlıyor..." : "Toshi ile Oluştur"}</span>
                    </button>
                    <button onClick={onAdd} className="px-3 py-2 text-sm bg-primary/10 text-primary rounded-lg font-medium">+ Soru Ekle</button>
                </div>
            </div>
            <div className="space-y-3">
                {faq.map((item: any, index: number) => (
                    <div key={index} className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
                        <input type="text" value={item.question} onChange={(e) => onUpdate(index, "question", e.target.value)} placeholder="Soru" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        <textarea value={item.answer} onChange={(e) => onUpdate(index, "answer", e.target.value)} placeholder="Cevap" rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
                        <button onClick={() => onRemove(index)} className="text-xs text-red-600">Kaldır</button>
                    </div>
                ))}
            </div>
            {faq.length === 0 && <div className="text-center py-6 text-gray-500 text-sm bg-gray-100 rounded-lg">Henüz FAQ eklenmemiş.</div>}
            
            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">İptal</button>
                <button onClick={onSave} disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? "Kaydediliyor..." : "Kaydet"}
                </button>
            </div>
        </div>
    );
}

function GEOSection({ keyTakeaways, onAdd, onUpdate, onRemove, onGenerateAI, isGenerating, onSave, onCancel, isSaving }: any) {
    return (
        <div className="space-y-4">
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                <h4 className="font-medium text-orange-900">GEO / LLM Optimizasyonu</h4>
            </div>
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">Önemli Çıkarımlar</h4>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={onGenerateAI} 
                            disabled={isGenerating}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <span className="flex items-center justify-center w-5 h-5 bg-white/10 rounded text-xs font-semibold">T</span>
                            )}
                            <span>{isGenerating ? "Toshi hazırlıyor..." : "Toshi ile Oluştur"}</span>
                        </button>
                        <button onClick={onAdd} className="px-3 py-2 text-sm bg-primary/10 text-primary rounded-lg font-medium">+ Ekle</button>
                    </div>
                </div>
                <div className="space-y-2">
                    {keyTakeaways.map((takeaway: string, index: number) => (
                        <div key={index} className="flex gap-2">
                            <input type="text" value={takeaway} onChange={(e) => onUpdate(index, e.target.value)} placeholder={`Çıkarım ${index + 1}`} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                            <button onClick={() => onRemove(index)} className="px-2 text-red-600">×</button>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200">
                <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">İptal</button>
                <button onClick={onSave} disabled={isSaving} className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium disabled:opacity-50">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? "Kaydediliyor..." : "Kaydet"}
                </button>
            </div>
        </div>
    );
}
