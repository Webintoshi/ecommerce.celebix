"use client";

import { useState } from "react";
import { Share2, Facebook, Twitter, Linkedin, MessageCircle, Image as ImageIcon, RefreshCw } from "lucide-react";
import { getAllProducts } from "@/lib/products";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export default function SocialPreviewPage() {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const storeHost = STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Mock Preview State
    const [ogTitle, setOgTitle] = useState("");
    const [ogDesc, setOgDesc] = useState("");
    const [ogImage, setOgImage] = useState("");

    // Platform selection
    const [activeTab, setActiveTab] = useState<"facebook" | "twitter" | "whatsapp" | "linkedin">("facebook");

    // Load from mock existing logic logic or helper
    const fetchMetadata = async () => {
        if (!url) return;
        setLoading(true);

        // Simulate fetching metadata from the URL (In a real app, this needs a server-side scraper)
        // Here we will try to match the URL to our internal products for demo purposes.
        setTimeout(async () => {
            const products = await getAllProducts();
            const slug = url.split("/").pop(); // highly naive
            const found = products.find(p => p.slug === slug || url.includes(p.slug));

            if (found) {
                setOgTitle(found.seoTitle || found.name);
                setOgDesc(found.seoDescription || found.shortDescription);
                setOgImage(found.images[0]);
            } else {
                // Default Fallback
                setOgTitle(`${STORE_RUNTIME.name} - ${STORE_RUNTIME.tagline}`);
                setOgDesc(`${STORE_RUNTIME.name} magazasindaki urunleri ve icerikleri kesfedin.`);
                setOgImage("/images/logo-bg.jpg"); // assuming exists or placeholder
            }
            setLoading(false);
        }, 800);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Share2 className="w-8 h-8 text-indigo-600" />
                    Sosyal Medya Önizleme
                </h1>
                <p className="text-gray-500">
                    Linklerinizin Facebook, Twitter, WhatsApp ve LinkedIn'de nasıl görüneceğini test edin.
                </p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex gap-4 mb-6">
                    <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder={`Orn: ${STORE_RUNTIME.storefrontUrl}/urunler/ornek-urun`}
                        className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <button
                        onClick={fetchMetadata}
                        disabled={loading}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                    >
                        {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Getir
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Editor */}
                    <div className="lg:col-span-5 space-y-4 border-r border-gray-100 pr-0 lg:pr-8">
                        <h3 className="font-semibold text-gray-900 mb-2">Meta Etiketlerini Düzenle</h3>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">OG Başlık (Title)</label>
                            <input
                                type="text"
                                value={ogTitle}
                                onChange={(e) => setOgTitle(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                            <p className="text-xs text-right text-gray-400 mt-1">{ogTitle.length} / 60</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">OG Açıklama (Description)</label>
                            <textarea
                                value={ogDesc}
                                onChange={(e) => setOgDesc(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                            />
                            <p className="text-xs text-right text-gray-400 mt-1">{ogDesc.length} / 160</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">OG Resim URL</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={ogImage}
                                    onChange={(e) => setOgImage(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                                <button className="p-2 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200">
                                    <ImageIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="pt-4">
                            <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg text-sm border border-yellow-100">
                                <strong>İpucu:</strong> Buradaki değişiklikler veritabanına kaydedilmez, sadece önizleme amaçlıdır. Kalıcı olması için ürünü düzenlemeniz gerekir.
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="lg:col-span-7">
                        <div className="flex gap-2 mb-6 border-b border-gray-200">
                            <TabButton
                                active={activeTab === "facebook"}
                                onClick={() => setActiveTab("facebook")}
                                icon={<Facebook className="w-4 h-4" />}
                                label="Facebook"
                            />
                            <TabButton
                                active={activeTab === "twitter"}
                                onClick={() => setActiveTab("twitter")}
                                icon={<Twitter className="w-4 h-4" />}
                                label="Twitter"
                            />
                            <TabButton
                                active={activeTab === "linkedin"}
                                onClick={() => setActiveTab("linkedin")}
                                icon={<Linkedin className="w-4 h-4" />}
                                label="LinkedIn"
                            />
                            <TabButton
                                active={activeTab === "whatsapp"}
                                onClick={() => setActiveTab("whatsapp")}
                                icon={<MessageCircle className="w-4 h-4" />}
                                label="WhatsApp"
                            />
                        </div>

                        <div className="bg-gray-100 p-8 rounded-xl min-h-[400px] flex items-center justify-center">
                            {activeTab === "facebook" && (
                                <div className="bg-white max-w-[500px] w-full border border-gray-300 rounded overflow-hidden">
                                    <div className="h-[260px] bg-gray-200 relative overflow-hidden">
                                        {ogImage && <img src={ogImage} alt="Preview" className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="p-3 bg-[#f2f3f5] border-t border-gray-300">
                                        <p className="text-xs text-gray-500 uppercase font-medium truncate mb-0.5">{storeHost.toUpperCase()}</p>
                                        <h4 className="font-bold text-gray-900 leading-tight mb-1 truncate font-sans">{ogTitle || "Başlık"}</h4>
                                        <p className="text-sm text-gray-600 line-clamp-1">{ogDesc || "Açıklama metni buraya gelecek..."}</p>
                                    </div>
                                </div>
                            )}

                            {activeTab === "twitter" && (
                                <div className="bg-white max-w-[440px] w-full border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                                    <div className="h-[220px] bg-gray-200 relative overflow-hidden">
                                        {ogImage && <img src={ogImage} alt="Preview" className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="p-3">
                                        <h4 className="font-bold text-gray-900 leading-tight mb-1 truncate">{ogTitle || "Başlık"}</h4>
                                        <p className="text-sm text-gray-500 line-clamp-2">{ogDesc || "Açıklama metni buraya gelecek..."}</p>
                                        <p className="text-sm text-gray-400 mt-1">{storeHost}</p>
                                    </div>
                                </div>
                            )}

                            {/* Simplified implementations for others */}
                            {activeTab === "linkedin" && (
                                <div className="bg-white max-w-[500px] w-full shadow-sm">
                                    <div className="h-[260px] bg-gray-200 relative overflow-hidden">
                                        {ogImage && <img src={ogImage} alt="Preview" className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="p-3 bg-[#eef3f8]">
                                        <h4 className="font-semibold text-gray-900 leading-tight mb-1 truncate">{ogTitle || "Başlık"}</h4>
                                        <p className="text-xs text-gray-500">{storeHost}</p>
                                    </div>
                                </div>
                            )}

                            {activeTab === "whatsapp" && (
                                <div className="bg-[#e5ddd5] p-4 w-full max-w-sm rounded">
                                    <div className="bg-white p-1 rounded-lg shadow-sm flex items-start gap-0 max-w-[300px] relative">
                                        <div className="w-[4px] h-full absolute left-0 top-0 bg-gray-300 rounded-l"></div>
                                        <div className="p-2 flex-1 min-w-0">
                                            <h4 className="font-bold text-black text-sm leading-tight mb-1 truncate">{ogTitle || "Başlık"}</h4>
                                            <p className="text-xs text-gray-500 line-clamp-2 leading-snug">{ogDesc || "Açıklama..."}</p>
                                            <p className="text-xs text-gray-400 mt-1">{storeHost}</p>
                                        </div>
                                        {ogImage && (
                                            <div className="w-16 h-16 bg-gray-200 mt-2 mr-2 mb-2 rounded flex-shrink-0 overflow-hidden">
                                                <img src={ogImage} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${active
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
        >
            {icon}
            {label}
        </button>
    );
}
