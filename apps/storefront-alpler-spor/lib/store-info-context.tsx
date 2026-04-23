"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { buildStoreTypographyCssVariables } from "@celebix/platform-config/src/typography";
import type { StoreTypographySettings } from "@celebix/platform-config/src/typography";
import {
    normalizeFloatingContactSettings,
    type FloatingContactSettings,
} from "@celebix/platform-config/src/floating-contact";

export interface StoreInfo {
    name: string;
    email: string;
    phone: string;
    address: string;
    currency: string;
    timezone?: string;
    logoUrl?: string;
    faviconUrl?: string;
    socialInstagram?: string;
    socialTwitter?: string;
    typography?: StoreTypographySettings;
    floatingContact?: FloatingContactSettings;
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
    const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(
        normalizeStoreInfo(initialStoreInfo),
    );
    const [loading, setLoading] = useState(initialStoreInfo === null);

    const fetchStoreInfo = async () => {
        try {
            const res = await fetch("/api/settings?type=store");
            const data = await res.json();
            if (data.success && data.storeInfo) {
                setStoreInfo(normalizeStoreInfo(data.storeInfo));
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

    useEffect(() => {
        if (typeof document === "undefined") return;

        const typographyVariables = buildStoreTypographyCssVariables(storeInfo?.typography);

        for (const [key, value] of Object.entries(typographyVariables)) {
            document.documentElement.style.setProperty(key, value);
        }
    }, [storeInfo]);

    return (
        <StoreInfoContext.Provider value={{ storeInfo, loading, refetch: fetchStoreInfo }}>
            {children}
        </StoreInfoContext.Provider>
    );
}

function normalizeStoreInfo(value: StoreInfo | null | undefined): StoreInfo | null {
    if (!value) {
        return null;
    }

    return {
        ...value,
        floatingContact: normalizeFloatingContactSettings(value.floatingContact),
    };
}
