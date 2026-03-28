"use client";

import { useState, useEffect, createContext, useContext } from "react";

export interface StoreInfo {
    name: string;
    email: string;
    phone: string;
    address: string;
    currency: string;
    timezone: string;
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

export function StoreInfoProvider({ children }: { children: React.ReactNode }) {
    const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStoreInfo = async () => {
        try {
            const res = await fetch("/api/settings?type=store");
            const data = await res.json();
            if (data.success && data.storeInfo) {
                setStoreInfo(data.storeInfo);
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
