"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { initTracking, trackPageView } from "@/lib/tracking";

export default function TrackingProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isInitialized = useRef(false);
    const previousPath = useRef<string | null>(null);

    // Initialize tracking on mount
    useEffect(() => {
        if (!isInitialized.current) {
            initTracking();
            isInitialized.current = true;
        }
    }, []);

    // Track page views on route change
    useEffect(() => {
        if (previousPath.current !== null && previousPath.current !== pathname) {
            // Route changed, track new page view
            trackPageView(pathname);
        }
        previousPath.current = pathname;
    }, [pathname]);

    return <>{children}</>;
}
