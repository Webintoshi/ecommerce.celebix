"use client";

import { useState } from "react";
import { Zap, Globe, Send, CheckCircle2, AlertCircle, Key, Info } from "lucide-react";
import { submitToIndexNow, pingSearchEngines, generateIndexNowKey } from "@/lib/indexing-service";
import { STORE_RUNTIME } from "@/lib/store-runtime";

export default function FastIndexingPage() {
    const [url, setUrl] = useState("");
    const [apiKey, setApiKey] = useState("a1b2c3d4e5f6g7h8"); // Mock/Default key
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<{ provider: string; success: boolean; message: string }[]>([]);
    const defaultHost = STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Helpers
    const generateNewKey = () => {
        setApiKey(generateIndexNowKey());
    };

    const handleIndexNow = async () => {
        if (!url) return;
        setLoading(true);
        setResults([]);

        // Extract host from URL mostly
        let host = defaultHost;
        try {
            const urlObj = new URL(url);
            host = urlObj.hostname;
        } catch {
            // Fallback
        }

        // Simulate delay
        setTimeout(async () => {
            const res = await submitToIndexNow(url, apiKey, host);
            setResults(res);
            setLoading(false);
        }, 1500);
    };

    const handlePing = async () => {
        setLoading(true);
        setResults([]);
        // Assuming default sitemap
        const sitemap = `${STORE_RUNTIME.storefrontUrl}/sitemap.xml`;

        setTimeout(async () => {
            const res = await pingSearchEngines(sitemap);
            setResults(res);
            setLoading(false);
        }, 1000);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Zap className="w-8 h-8 text-yellow-500" />
                    Hızlı İndex Yöneticisi
                </h1>
                <p className="text-gray-500">
                    İçeriklerinizi anında Google, Bing ve Yandex'e bildirin.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* IndexNow Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <Send className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">IndexNow (Anlık Bildirim)</h2>
                            <p className="text-sm text-gray-500">Bing & Yandex için en hızlı yöntem.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">İndexlenecek URL</label>
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder={`${STORE_RUNTIME.storefrontUrl}/urunler/yeni-urun`}
                                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono text-sm"
                            />
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider flex justify-between">
                                API Key (Host Key)
                                <button onClick={generateNewKey} className="text-blue-600 hover:underline flex items-center gap-1 normal-case">
                                    <Key className="w-3 h-3" /> Yenile
                                </button>
                            </label>
                            <div className="font-mono text-xs text-gray-600 break-all bg-white p-2 rounded border border-gray-100">
                                {apiKey}
                            </div>
                            <div className="mt-2 flex items-start gap-2 text-xs text-gray-500">
                                <Info className="w-4 h-4 text-blue-400 mt-0.5" />
                                Bu anahtarı içeren bir metin dosyasını sunucunuzun ana dizinine ({apiKey}.txt) yüklemeniz gerekir.
                            </div>
                        </div>

                        <button
                            onClick={handleIndexNow}
                            disabled={!url || loading}
                            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Gönderiliyor..." : "Bing & Yandex'e Bildir"}
                        </button>
                    </div>
                </div>

                {/* Global Ping Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                            <Globe className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Sitemap Ping</h2>
                            <p className="text-sm text-gray-500">Google ve diğerlerine "Haritam Güncellendi" de.</p>
                        </div>
                    </div>

                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 mb-6">
                        <p className="text-sm text-orange-800">
                            <strong>Not:</strong> Bu işlem tüm sitemap'i tekrar taratmak içindir. Sıklıkla yapılması önerilmez. Sadece büyük güncellemelerden sonra kullanın.
                        </p>
                    </div>

                    <button
                        onClick={handlePing}
                        disabled={loading}
                        className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "Sinyal Gönderiliyor..." : "Google & Bing'e Ping At"}
                    </button>
                </div>
            </div>

            {/* Results Log */}
            {results.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 font-semibold text-gray-800">
                        İşlem Sonuçları
                    </div>
                    <div className="divide-y divide-gray-100">
                        {results.map((res, idx) => (
                            <div key={idx} className="p-4 flex items-center gap-3">
                                {res.success ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                ) : (
                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                )}
                                <div>
                                    <span className="font-medium text-gray-900">{res.provider}: </span>
                                    <span className="text-gray-600">{res.message}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
