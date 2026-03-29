"use client";

import { useState, useEffect, createContext, useContext } from "react";

export interface StoreInfo {
    name: string;
    email: string;
    phone: string;
    address: string;
    currency: string;
    timezone: string;
    logoUrl?: string;
    socialInstagram?: string;
    socialTwitter?: string;
}

interface StoreInfoContextType {
    storeInfo: StoreInfo | null;
    loading: boolean;
    refetch: () => void;
}

const StoreInfoContext = createContext<StoreInfoContextType>({
    storeInfo: null,
    loading: true,
    refetch: () => {},
});

export function useStoreInfo() {
    return useContext(StoreInfoContext);
}

interface StoreInfoProviderProps {
    children: React.ReactNode;
    initialStoreInfo?: StoreInfo | null;
}

export function StoreInfoProvider({
    children,
    initialStoreInfo = null,
}: StoreInfoProviderProps) {
    const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(initialStoreInfo);
    const [loading, setLoading] = useState(initialStoreInfo === null);

    const fetchStoreInfo = async () => {
        try {
            const res = await fetch("/api/settings?type=store");
            const data = await res.json();
            if (data.success && data.storeInfo) {
                setStoreInfo(data.storeInfo);
            } else if (!data.success) {
                throw new Error(data.error || "Store info getirilemedi.");
            }
        } catch (error) {
            console.error("Failed to fetch store info:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStoreInfo();
    }, []);

    return (
        <StoreInfoContext.Provider value={{ storeInfo, loading, refetch: fetchStoreInfo }}>
            {children}
        </StoreInfoContext.Provider>
    );
}
