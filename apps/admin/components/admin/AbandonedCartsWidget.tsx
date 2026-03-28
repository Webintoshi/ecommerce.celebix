"use client";

import { useState, useEffect } from "react";
import { ShoppingCart, TrendingUp, AlertTriangle, Clock, DollarSign } from "lucide-react";

interface AbandonedData {
    count: number;
    total: number;
}

interface TodayStats {
    addToCart: number;
    purchases: number;
}

export default function AbandonedCartsWidget() {
    const [abandoned, setAbandoned] = useState<AbandonedData>({ count: 0, total: 0 });
    const [today, setToday] = useState<TodayStats>({ addToCart: 0, purchases: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch("/api/analytics/live");
                const json = await res.json();
                if (json.success) {
                    setAbandoned(json.data.abandonedCarts);
                    setToday(json.data.today);
                }
            } catch (error) {
                console.error("Failed to fetch abandoned carts:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    const conversionRate = today.addToCart > 0
        ? Math.round((today.purchases / today.addToCart) * 100)
        : 0;

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-orange-500" />
                    Yarım Kalan Sepetler
                </h3>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Son 24 saat
                </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-orange-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-orange-600 mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">Terk Edilen</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{abandoned.count}</div>
                    <div className="text-xs text-gray-500">sepet</div>
                </div>

                <div className="bg-red-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-600 mb-1">
                        <DollarSign className="w-4 h-4" />
                        <span className="text-sm font-medium">Kayıp Değer</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        ₺{abandoned.total.toLocaleString("tr-TR")}
                    </div>
                    <div className="text-xs text-gray-500">potansiyel satış</div>
                </div>
            </div>

            {/* Conversion funnel */}
            <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-500 mb-3">Bugünkü Dönüşüm</h4>
                <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-600">Sepete Ekleme</span>
                            <span className="font-medium text-gray-900">{today.addToCart}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: "100%" }}></div>
                        </div>
                    </div>
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                    <div className="flex-1">
                        <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-600">Satın Alma</span>
                            <span className="font-medium text-gray-900">{today.purchases}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full">
                            <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${conversionRate}%` }}
                            ></div>
                        </div>
                    </div>
                </div>
                <div className="text-center mt-2">
                    <span className="text-xs text-gray-500">
                        Dönüşüm Oranı: <span className="font-semibold text-green-600">{conversionRate}%</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
