"use client";

import { useState, useEffect } from "react";
import {
    ShoppingCart,
    Eye,
    CreditCard,
    CheckCircle,
    Search,
    MousePointer,
    Zap
} from "lucide-react";

interface ActivityEvent {
    type: string;
    data: Record<string, unknown>;
    pageUrl: string;
    createdAt: string;
}

const eventIcons: Record<string, React.ReactNode> = {
    add_to_cart: <ShoppingCart className="w-4 h-4 text-blue-500" />,
    remove_from_cart: <ShoppingCart className="w-4 h-4 text-red-500" />,
    view_product: <Eye className="w-4 h-4 text-gray-500" />,
    checkout_start: <CreditCard className="w-4 h-4 text-purple-500" />,
    checkout_step: <CreditCard className="w-4 h-4 text-purple-400" />,
    purchase: <CheckCircle className="w-4 h-4 text-green-500" />,
    search: <Search className="w-4 h-4 text-orange-500" />,
    click: <MousePointer className="w-4 h-4 text-gray-400" />,
};

const eventLabels: Record<string, string> = {
    add_to_cart: "Sepete ürün eklendi",
    remove_from_cart: "Sepetten ürün çıkarıldı",
    view_product: "Ürün görüntülendi",
    checkout_start: "Ödeme başladı",
    checkout_step: "Ödeme adımı",
    purchase: "Sipariş tamamlandı",
    search: "Arama yapıldı",
    click: "Tıklama",
};

function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return `${diff}s önce`;
    if (diff < 3600) return `${Math.floor(diff / 60)}dk önce`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}sa önce`;
    return `${Math.floor(diff / 86400)}g önce`;
}

export default function ActivityFeed() {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const res = await fetch("/api/analytics/live");
                const json = await res.json();
                if (json.success && json.data.recentEvents) {
                    setEvents(json.data.recentEvents);
                }
            } catch (error) {
                console.error("Failed to fetch events:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
        const interval = setInterval(fetchEvents, 15000); // Refresh every 15 seconds
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                            <div className="flex-1 h-4 bg-gray-200 rounded"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" />
                    Anlık Aktivite
                </h3>
                <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                    </span>
                    <span className="text-xs text-gray-500">Canlı</span>
                </div>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {events.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                        Henüz aktivite yok
                    </p>
                ) : (
                    events.map((event, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                {eventIcons[event.type] || <Eye className="w-4 h-4 text-gray-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-900">
                                    {eventLabels[event.type] || event.type}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {event.pageUrl}
                                </p>
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                                {formatTimeAgo(event.createdAt)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
