"use client";

import { useState, useEffect } from "react";
import {
    Link as LinkIcon,
    Plus,
    Trash2,
    Wand2,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Zap,
    BookOpen,
    ArrowRight
} from "lucide-react";
import { KeywordRule, getSeoRules, saveSeoRules, autoLinkContent, generateDefaultRulesFromProducts } from "@/lib/seo-engine";
import { getAllProducts, updateProduct } from "@/lib/products";
import { motion, AnimatePresence } from "framer-motion";

export default function InternalLinkingPage() {
    const [rules, setRules] = useState<KeywordRule[]>([]);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // New Rule State
    const [newKeyword, setNewKeyword] = useState("");
    const [newUrl, setNewUrl] = useState("");

    useEffect(() => {
        loadRules();
    }, []);

    const loadRules = () => {
        const stored = getSeoRules();
        setRules(stored);
    };

    const handleAddRule = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        if (!newKeyword || !newUrl) return;

        // Check duplicate
        if (rules.some(r => r.keyword.toLowerCase() === newKeyword.toLowerCase())) {
            setMessage({ type: "error", text: "Bu kelimeyi robot zaten biliyor!" });
            return;
        }

        const newRule: KeywordRule = {
            id: Date.now().toString(),
            keyword: newKeyword,
            url: newUrl,
            active: true,
        };

        const updated = [newRule, ...rules];
        setRules(updated);
        saveSeoRules(updated);
        setNewKeyword("");
        setNewUrl("");
        setMessage({ type: "success", text: "Robot yeni bir kelime öğrendi! 🎉" });
    };

    const handleDeleteRule = (id: string) => {
        const updated = rules.filter(r => r.id !== id);
        setRules(updated);
        saveSeoRules(updated);
        setMessage({ type: "success", text: "Kural silindi." });
    };

    const handleGenerateFromProducts = async () => {
        if (!confirm("Mağazadaki tüm ürün isimlerini robota öğretmek istiyor musun?")) return;

        const defaults = await generateDefaultRulesFromProducts();
        const currentKeywords = new Set(rules.map(r => r.keyword.toLowerCase()));
        const newRules = defaults.filter(r => !currentKeywords.has(r.keyword.toLowerCase()));

        if (newRules.length === 0) {
            setMessage({ type: "error", text: "Robot zaten tüm ürünleri biliyor! 🧠" });
            return;
        }

        const updated = [...rules, ...newRules];
        setRules(updated);
        saveSeoRules(updated);
        setMessage({ type: "success", text: `Harika! Robot ${newRules.length} yeni ürün öğrendi! 🚀` });
    };

    const handleRunAutoLinker = async () => {
        if (!confirm("Hazır mısın? Robot tüm ürün açıklamalarını okuyacak ve bildiği kelimelere link ekleyecek. Başlayalım mı? 🤖")) return;

        setProcessing(true);
        setMessage(null);

        setTimeout(async () => {
            try {
                const products = await getAllProducts();
                let updateCount = 0;

                products.forEach(product => {
                    const originalDesc = product.description;
                    const newDesc = autoLinkContent(originalDesc, rules);

                    if (originalDesc !== newDesc) {
                        updateProduct(product.id, { description: newDesc });
                        updateCount++;
                    }
                });

                if (updateCount > 0) {
                    setMessage({ type: "success", text: `Görev tamamlandı! ${updateCount} ürüne link eklendi. Robot yoruldu ama mutlu! 🥳` });
                } else {
                    setMessage({ type: "success", text: "Robot tüm ürünleri kontrol etti ama eklenecek yeni link bulamadı. Her şey yolunda! 👍" });
                }
            } catch (error) {
                setMessage({ type: "error", text: "Robotun kafası karıştı. Lütfen tekrar dene." });
            } finally {
                setProcessing(false);
            }
        }, 1500); // Biraz daha uzun animasyon
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                        <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                            <Zap className="w-7 h-7" />
                        </div>
                        Linkleme Robotu
                    </h1>
                    <p className="text-gray-500 mt-2 text-lg">
                        Site içindeki kelimeleri senin için birbirine bağlayan akıllı yardımcı.
                    </p>
                </div>

                <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-100 shadow-sm">
                    <div className="px-4 py-2 bg-blue-50 rounded-lg text-blue-700 font-bold">
                        {rules.length} Kelime Biliyor
                    </div>
                </div>
            </div>

            {/* Notification Area */}
            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`p-4 rounded-xl flex items-center gap-3 shadow-sm border-l-4 ${message.type === 'success'
                                ? 'bg-green-50 text-green-700 border-green-500'
                                : 'bg-red-50 text-red-700 border-red-500'
                            }`}
                    >
                        {message.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                        <span className="font-medium text-lg">{message.text}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Sol Taraf: Robotu Eğit (Yeni Kural Ekle) */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-lg shadow-blue-500/5 border border-blue-100 overflow-hidden relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-purple-400"></div>
                        <div className="p-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-purple-500" />
                                Robotu Eğit
                            </h2>
                            <p className="text-gray-500 text-sm mb-6">
                                Robota yeni bir kelime öğret, o da bu kelimeyi gördüğünde link versin.
                            </p>

                            <form onSubmit={handleAddRule} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Hangi kelimeyi bulsun?
                                    </label>
                                    <input
                                        type="text"
                                        value={newKeyword}
                                        onChange={(e) => setNewKeyword(e.target.value)}
                                        placeholder="Örn: Fıstık Ezmesi"
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all text-lg placeholder:text-gray-400"
                                    />
                                </div>
                                <div className="flex justify-center">
                                    <ArrowRight className="w-6 h-6 text-gray-300" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Nereye gitsin? (Link)
                                    </label>
                                    <input
                                        type="text"
                                        value={newUrl}
                                        onChange={(e) => setNewUrl(e.target.value)}
                                        placeholder="Örn: /urunler/fistik-ezmesi"
                                        className="w-full px-4 py-3 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all text-lg placeholder:text-gray-400 text-blue-600 font-medium"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!newKeyword || !newUrl}
                                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-xl font-bold text-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-200 transform active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                                >
                                    <Plus className="w-6 h-6" />
                                    Öğret ve Kaydet
                                </button>
                            </form>
                        </div>

                        <div className="bg-blue-50 p-4 border-t border-blue-100">
                            <button
                                onClick={handleGenerateFromProducts}
                                className="w-full flex items-center justify-center gap-2 text-blue-700 font-medium hover:bg-white hover:shadow-sm py-2 rounded-lg transition-all text-sm"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Ürün İsimlerini Otomatik Öğret
                            </button>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
                        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                            <Wand2 className="w-6 h-6" />
                            Sıra Robotun!
                        </h2>
                        <p className="text-purple-100 mb-6 text-sm">
                            Tüm kuralları kullanarak siteyi tarayalım mı?
                        </p>

                        <button
                            onClick={handleRunAutoLinker}
                            disabled={processing || rules.length === 0}
                            className="w-full bg-white text-purple-700 py-4 rounded-xl font-bold text-lg hover:bg-purple-50 transition-all shadow-lg transform active:scale-95 disabled:opacity-75 disabled:scale-100 flex items-center justify-center gap-3"
                        >
                            {processing ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-purple-700 border-t-transparent rounded-full animate-spin" />
                                    Taranıyor...
                                </>
                            ) : (
                                <>
                                    <Zap className="w-5 h-5 fill-current" />
                                    Robotu Çalıştır
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Sağ Taraf: Robotun Hafızası (Kurallar Listesi) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-gray-900">
                            Robotun Hafızası
                        </h2>
                        <span className="text-sm text-gray-500">
                            {rules.length} kural tanımlı
                        </span>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-4 min-h-[500px]">
                        {rules.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-center">
                                <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4 text-gray-400">
                                    <BookOpen className="w-10 h-10" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-600 mb-1">
                                    Hafıza Boş
                                </h3>
                                <p className="text-gray-400 text-sm max-w-xs">
                                    Sol taraftan yeni kelimeler öğretebilirsin.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <AnimatePresence>
                                    {rules.map(rule => (
                                        <motion.div
                                            key={rule.id}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            layout
                                            className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden"
                                        >
                                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-xl"></div>

                                            <div className="flex justify-between items-start">
                                                <div className="flex-1 min-w-0 pr-8">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-sm font-bold">
                                                            "{rule.keyword}"
                                                        </span>
                                                        <span className="text-gray-400 text-xs">görünce</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-gray-500 text-sm group-hover:text-blue-600 transition-colors">
                                                        <LinkIcon className="w-3 h-3 flex-shrink-0" />
                                                        <span className="truncate">{rule.url}</span>
                                                        <span className="text-xs text-gray-400 ml-1">adresine git</span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                    className="absolute top-2 right-2 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Kuralı Sil"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
