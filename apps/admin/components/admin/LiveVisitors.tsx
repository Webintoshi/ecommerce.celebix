"use client";

import { useState, useEffect } from "react";
import { Users, Monitor, Smartphone, Tablet, AlertCircle, RefreshCw, Bot } from "lucide-react";

interface LiveData {
    liveVisitors: number;
    devices: {
        mobile: number;
        desktop: number;
        tablet: number;
    };
    topPages: Array<{ url: string; count: number }>;
}

const BOT_USER_AGENTS = [
    'bot', 'spider', 'crawler', 'googlebot', 'bingbot', 'yandex', 'duckduckbot',
    'facebookexternalhit', 'twitterbot', 'linkedinbot', 'slackbot', 'telegrambot',
    'applebot', 'semrush', 'ahrefs', 'mj12bot', 'dotbot', 'rogerbot', 'screaming frog'
];

function isBot(userAgent: string | undefined): boolean {
    if (!userAgent) return false;
    const ua = userAgent.toLowerCase();
    return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

export default function LiveVisitors() {
    const [data, setData] = useState<LiveData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLiveData = async () => {
        try {
            const res = await fetch("/api/analytics/live");
            const json = await res.json();
            
            if (json.success && json.data) {
                const rawData = json.data;
                
                const filteredData = {
                    liveVisitors: rawData.liveVisitors || 0,
                    devices: rawData.devices || { mobile: 0, desktop: 0, tablet: 0 },
                    topPages: rawData.topPages || []
                };
                
                setData(filteredData);
                setError(null);
            } else {
                setError(json.error || "Veri alınamadı");
            }
        } catch (err) {
            console.error("Failed to fetch live data:", err);
            setError("Bağlantı hatası");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLiveData();
        const interval = setInterval(fetchLiveData, 20000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-gray-400" />
                        Anlık Ziyaretçiler
                    </h3>
                </div>
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <AlertCircle className="w-8 h-8 text-gray-400" />
                    <span className="text-gray-500">{error}</span>
                    <button 
                        onClick={() => { setLoading(true); fetchLiveData(); }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Tekrar Dene
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-green-500" />
                    Anlık Ziyaretçiler
                </h3>
                <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span className="text-sm text-gray-500">Canlı</span>
                </div>
            </div>

            <div className="text-4xl font-bold text-gray-900 mb-1">
                {data?.liveVisitors || 0}
                <span className="text-lg font-normal text-gray-500 ml-2">kişi</span>
            </div>
            
            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1">
                <Bot className="w-3 h-3" />
                Bot'lar filtrelendi
            </p>

            <div className="grid grid-cols-3 gap-4 mb-4 py-4 border-y border-gray-100">
                <div className="text-center">
                    <Smartphone className="w-5 h-5 mx-auto text-gray-400 mb-1" />
                    <div className="text-lg font-semibold text-gray-900">{data?.devices?.mobile || 0}</div>
                    <div className="text-xs text-gray-500">Mobil</div>
                </div>
                <div className="text-center">
                    <Monitor className="w-5 h-5 mx-auto text-gray-400 mb-1" />
                    <div className="text-lg font-semibold text-gray-900">{data?.devices?.desktop || 0}</div>
                    <div className="text-xs text-gray-500">Desktop</div>
                </div>
                <div className="text-center">
                    <Tablet className="w-5 h-5 mx-auto text-gray-400 mb-1" />
                    <div className="text-lg font-semibold text-gray-900">{data?.devices?.tablet || 0}</div>
                    <div className="text-xs text-gray-500">Tablet</div>
                </div>
            </div>

            {data?.topPages && data.topPages.length > 0 && (
                <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Aktif Sayfalar</h4>
                    <div className="space-y-2">
                        {data.topPages.map((page, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                                <span className="text-gray-700 truncate max-w-[180px]">{page.url}</span>
                                <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                    {page.count} kişi
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
