"use client";

import { useState, useEffect } from "react";
import {
    ArrowLeft,
    Brain,
    Eye,
    EyeOff,
    Save,
    Loader2,
    CheckCircle,
    XCircle,
    Zap,
    Sparkles,
} from "lucide-react";
import Link from "next/link";

type AIProvider = "gemini" | "claude" | "deepseek";

interface AIConfig {
    provider: AIProvider;
    apiKey: string;
    model: string;
}

const PROVIDERS = [
    {
        id: "gemini" as AIProvider,
        name: "Google Gemini",
        description: "Google'ın en güçlü yapay zekası. Function calling destekli.",
        models: ["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite-preview-06-17", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"],
        color: "from-blue-500 to-cyan-500",
        bgColor: "bg-blue-50 border-blue-200",
        activeColor: "bg-blue-600",
        badge: "Önerilen",
        features: ["Function Calling ✅", "Türkçe ✅", "Hızlı ✅"],
    },
    {
        id: "claude" as AIProvider,
        name: "Anthropic Claude",
        description: "Anthropic'in güçlü dil modeli. Detaylı analizlerde başarılı.",
        models: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
        color: "from-orange-500 to-amber-500",
        bgColor: "bg-orange-50 border-orange-200",
        activeColor: "bg-orange-600",
        badge: null,
        features: ["Uzun Bağlam ✅", "Türkçe ✅", "Analiz ✅"],
    },
    {
        id: "deepseek" as AIProvider,
        name: "DeepSeek",
        description: "Hızlı ve uygun fiyatlı yapay zeka. OpenAI uyumlu API.",
        models: ["deepseek-chat", "deepseek-reasoner"],
        color: "from-violet-500 to-purple-500",
        bgColor: "bg-violet-50 border-violet-200",
        activeColor: "bg-violet-600",
        badge: "Ekonomik",
        features: ["Uygun Fiyat ✅", "Türkçe ✅", "Hızlı ✅"],
    },
];

export default function AISettingsPage() {
    const [config, setConfig] = useState<AIConfig>({
        provider: "gemini",
        apiKey: "",
        model: "gemini-2.5-flash",
    });
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        success: boolean;
        message: string;
    } | null>(null);
    const [saveResult, setSaveResult] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [hasEnvKey, setHasEnvKey] = useState(false);

    // Load current settings
    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/settings?type=ai");
                const data = await res.json();
                if (data.success && data.aiSettings) {
                    setConfig({
                        provider: data.aiSettings.provider || "gemini",
                        apiKey: data.aiSettings.apiKey || "",
                        model: data.aiSettings.model || "gemini-2.5-flash",
                    });
                }
                if (data.hasEnvKey) setHasEnvKey(true);
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // Switch provider → reset model
    function selectProvider(p: AIProvider) {
        const providerData = PROVIDERS.find((pr) => pr.id === p);
        setConfig({
            ...config,
            provider: p,
            model: providerData?.models[0] || "",
        });
        setTestResult(null);
        setSaveResult(null);
    }

    // Test connection
    async function testConnection() {
        if (!config.apiKey) {
            setTestResult({ success: false, message: "API key girilmedi." });
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "ai-test",
                    aiSettings: config,
                }),
            });
            const data = await res.json();
            setTestResult(data.testResult || { success: false, message: "Test başarısız." });
        } catch {
            setTestResult({ success: false, message: "Bağlantı hatası." });
        } finally {
            setTesting(false);
        }
    }

    // Save settings
    async function saveSettings() {
        setSaving(true);
        setSaveResult(null);
        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "ai",
                    aiSettings: config,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSaveResult("Ayarlar başarıyla kaydedildi! ✅");
            } else {
                setSaveResult("Kaydetme hatası: " + (data.error || "Bilinmeyen"));
            }
        } catch {
            setSaveResult("Bağlantı hatası.");
        } finally {
            setSaving(false);
        }
    }

    const selectedProvider = PROVIDERS.find((p) => p.id === config.provider)!;

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    href="/admin/ayarlar"
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        <Brain className="w-6 h-6 text-purple-600" />
                        Yapay Zeka Ayarları
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Toshi ve SEO araçları için AI provider ve API key yapılandırması.
                    </p>
                </div>
            </div>

            {/* Env key info */}
            {hasEnvKey && !config.apiKey && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-blue-900">
                            .env dosyasında Gemini API key algılandı
                        </p>
                        <p className="text-sm text-blue-700 mt-1">
                            Mevcut sistem .env üzerinden çalışıyor. Buradan farklı bir provider veya key ayarlayabilirsiniz.
                        </p>
                    </div>
                </div>
            )}

            {/* Provider Selection */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    AI Provider Seçin
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {PROVIDERS.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => selectProvider(p.id)}
                            className={`relative text-left p-5 rounded-xl border-2 transition-all duration-200 ${config.provider === p.id
                                ? `${p.bgColor} border-current shadow-md scale-[1.02]`
                                : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                                }`}
                        >
                            {p.badge && (
                                <span
                                    className={`absolute top-3 right-3 text-xs font-medium px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${p.color}`}
                                >
                                    {p.badge}
                                </span>
                            )}
                            <div
                                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center mb-3`}
                            >
                                <Zap className="w-5 h-5 text-white" />
                            </div>
                            <h3 className="font-semibold text-gray-900">{p.name}</h3>
                            <p className="text-sm text-gray-500 mt-1">{p.description}</p>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {p.features.map((f) => (
                                    <span
                                        key={f}
                                        className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                                    >
                                        {f}
                                    </span>
                                ))}
                            </div>
                            {config.provider === p.id && (
                                <div
                                    className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-xl bg-gradient-to-r ${p.color}`}
                                />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* API Key Input */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                <h2 className="text-lg font-semibold text-gray-900">
                    {selectedProvider.name} Yapılandırması
                </h2>

                {/* API Key */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        API Key
                    </label>
                    <div className="relative">
                        <input
                            type={showKey ? "text" : "password"}
                            value={config.apiKey}
                            onChange={(e) =>
                                setConfig({ ...config, apiKey: e.target.value })
                            }
                            placeholder={`${selectedProvider.name} API key'inizi girin...`}
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all font-mono text-sm pr-12"
                        />
                        <button
                            type="button"
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            {showKey ? (
                                <EyeOff className="w-5 h-5" />
                            ) : (
                                <Eye className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                        Key veritabanında güvenli şekilde saklanır. .env dosyasına gerek
                        kalmaz.
                    </p>
                </div>

                {/* Model Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Model
                    </label>
                    <select
                        value={config.model}
                        onChange={(e) =>
                            setConfig({ ...config, model: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                    >
                        {selectedProvider.models.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 pt-2">
                    <button
                        onClick={testConnection}
                        disabled={testing || !config.apiKey}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {testing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Test ediliyor...
                            </>
                        ) : (
                            <>
                                <Zap className="w-4 h-4" />
                                Bağlantıyı Test Et
                            </>
                        )}
                    </button>

                    <button
                        onClick={saveSettings}
                        disabled={saving || !config.apiKey}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r ${selectedProvider.color} hover:opacity-90`}
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Kaydediliyor...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Kaydet
                            </>
                        )}
                    </button>
                </div>

                {/* Test Result */}
                {testResult && (
                    <div
                        className={`flex items-start gap-3 p-4 rounded-lg ${testResult.success
                            ? "bg-green-50 border border-green-200"
                            : "bg-red-50 border border-red-200"
                            }`}
                    >
                        {testResult.success ? (
                            <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        ) : (
                            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        )}
                        <p
                            className={`text-sm ${testResult.success ? "text-green-800" : "text-red-800"
                                }`}
                        >
                            {testResult.message}
                        </p>
                    </div>
                )}

                {/* Save Result */}
                {saveResult && (
                    <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
                        <p className="text-sm text-gray-800">{saveResult}</p>
                    </div>
                )}
            </div>

            {/* Info Box */}
            <div className="bg-gray-900 rounded-2xl p-6 text-white">
                <h3 className="font-semibold flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    Nasıl Çalışır?
                </h3>
                <ul className="mt-3 space-y-2 text-sm text-gray-300">
                    <li>
                        • <strong className="text-white">Gemini:</strong> Function
                        calling destekli — Toshi verileri doğrudan çekebilir
                    </li>
                    <li>
                        • <strong className="text-white">Claude/DeepSeek:</strong> Metin
                        tabanlı sohbet — Toshi genel bilgilendirme yapar
                    </li>
                    <li>
                        • <strong className="text-white">SEO araçları:</strong> Tüm
                        providerlar ile çalışır
                    </li>
                    <li>
                        • <strong className="text-white">Fallback:</strong>{" "}
                        Veritabanında key yoksa .env dosyasındaki Gemini key kullanılır
                    </li>
                </ul>
            </div>
        </div>
    );
}
