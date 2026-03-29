"use client";

const STORAGE_KEY = "celebix_storefront_session_id";

const BOT_USER_AGENTS = [
    'bot', 'spider', 'crawler', 'googlebot', 'bingbot', 'yandex',
    'duckduckbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'slackbot', 'telegrambot', 'applebot', 'semrush', 'ahrefs',
    'mj12bot', 'dotbot', 'rogerbot', 'screaming frog'
];

function isBot(userAgent: string | undefined): boolean {
    if (typeof window === "undefined") return false;
    const ua = userAgent?.toLowerCase() || navigator.userAgent.toLowerCase();
    return BOT_USER_AGENTS.some(bot => ua.includes(bot));
}

function shouldTrackPath(pathname: string): boolean {
    if (!pathname) return true;
    const lowerPath = pathname.toLowerCase();
    if (lowerPath.startsWith('/admin')) return false;
    if (lowerPath.startsWith('/api')) return false;
    if (lowerPath.startsWith('/_')) return false;
    return true;
}

function generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    return `sess_${timestamp}_${randomPart}`;
}

export function getSessionId(): string {
    if (typeof window === "undefined") return "";

    let sessionId = localStorage.getItem(STORAGE_KEY);

    if (!sessionId) {
        const oldSessionId = sessionStorage.getItem(STORAGE_KEY);
        if (oldSessionId) {
            sessionId = oldSessionId.startsWith('sess_') ? oldSessionId : `sess_${oldSessionId}`;
            localStorage.setItem(STORAGE_KEY, sessionId);
            sessionStorage.removeItem(STORAGE_KEY);
        }
    }

    if (sessionId && !sessionId.startsWith('sess_')) {
        sessionId = `sess_${sessionId}`;
        localStorage.setItem(STORAGE_KEY, sessionId);
    }

    if (!sessionId) {
        sessionId = generateSessionId();
        localStorage.setItem(STORAGE_KEY, sessionId);
    }

    return sessionId;
}

export function isUserBot(): boolean {
    if (typeof window === "undefined") return false;
    return isBot(navigator.userAgent);
}

function getDeviceType(): string {
    if (typeof window === "undefined") return "unknown";

    const userAgent = navigator.userAgent.toLowerCase();

    if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(userAgent)) {
        if (/ipad|tablet/i.test(userAgent)) return "tablet";
        return "mobile";
    }
    return "desktop";
}

function getBrowser(): string {
    if (typeof window === "undefined") return "unknown";

    const userAgent = navigator.userAgent;

    if (userAgent.includes("Chrome") && !userAgent.includes("Edge")) return "Chrome";
    if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) return "Safari";
    if (userAgent.includes("Firefox")) return "Firefox";
    if (userAgent.includes("Edge")) return "Edge";
    if (userAgent.includes("Opera") || userAgent.includes("OPR")) return "Opera";

    return "Other";
}

function getOS(): string {
    if (typeof window === "undefined") return "unknown";

    const userAgent = navigator.userAgent;

    if (userAgent.includes("Windows")) return "Windows";
    if (userAgent.includes("Mac")) return "macOS";
    if (userAgent.includes("Linux")) return "Linux";
    if (userAgent.includes("Android")) return "Android";
    if (userAgent.includes("iOS") || userAgent.includes("iPhone") || userAgent.includes("iPad")) return "iOS";

    return "Other";
}

function getUTMParams() {
    if (typeof window === "undefined") return {};

    const params = new URLSearchParams(window.location.search);

    return {
        utm_source: params.get("utm_source") || undefined,
        utm_medium: params.get("utm_medium") || undefined,
        utm_campaign: params.get("utm_campaign") || undefined,
    };
}

class Tracker {
    private sessionId: string = "";
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private isInitialized: boolean = false;
    private lastHeartbeat: number = 0;

    async init() {
        if (typeof window === "undefined" || this.isInitialized) return;
        this.isInitialized = true;

        if (isBot(navigator.userAgent)) {
            console.log('[Tracking] Bot detected, skipping');
            return;
        }

        const currentPath = window.location.pathname;
        if (!shouldTrackPath(currentPath)) {
            console.log('[Tracking] Admin/path skipped, not tracking');
            return;
        }

        this.sessionId = getSessionId();

        await this.createSession();
        this.startHeartbeat();

        await this.trackPageView();

        if (typeof window !== "undefined") {
            window.addEventListener("popstate", () => {
                const newPath = window.location.pathname;
                if (shouldTrackPath(newPath)) {
                    this.trackPageView();
                }
            });
        }
    }

    private async createSession() {
        try {
            const utmParams = getUTMParams();

            await fetch("/api/analytics/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    userAgent: navigator.userAgent,
                    referrer: document.referrer || undefined,
                    deviceType: getDeviceType(),
                    browser: getBrowser(),
                    os: getOS(),
                    ...utmParams,
                }),
            });
        } catch (error) {
            console.error("Failed to create session:", error);
        }
    }

    private startHeartbeat() {
        this.heartbeatInterval = setInterval(async () => {
            if (!shouldTrackPath(window.location.pathname)) {
                return;
            }

            const now = Date.now();
            if (now - this.lastHeartbeat < 10000) return;
            
            this.lastHeartbeat = now;
            
            try {
                await fetch("/api/analytics/heartbeat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        sessionId: this.sessionId,
                        path: window.location.pathname 
                    }),
                });
            } catch (error) {
                console.error("Heartbeat failed:", error);
            }
        }, 20000);
    }

    async trackPageView(customUrl?: string, customTitle?: string) {
        if (!this.sessionId) return;

        try {
            await fetch("/api/analytics/pageview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    pageUrl: customUrl || window.location.pathname,
                    pageTitle: customTitle || document.title,
                }),
            });
        } catch (error) {
            console.error("Failed to track page view:", error);
        }
    }

    async trackEvent(eventType: string, eventData?: Record<string, unknown>) {
        if (!this.sessionId) return;

        try {
            await fetch("/api/analytics/event", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    eventType,
                    eventData,
                    pageUrl: window.location.pathname,
                }),
            });
        } catch (error) {
            console.error("Failed to track event:", error);
        }
    }

    async trackCheckout(step: string, cartItems: unknown[], cartTotal: number, email?: string, phone?: string) {
        if (!this.sessionId) return;

        try {
            await fetch("/api/analytics/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    step,
                    cartItems,
                    cartTotal,
                    email,
                    phone,
                }),
            });
        } catch (error) {
            console.error("Failed to track checkout:", error);
        }
    }

    destroy() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    }
}

let trackerInstance: Tracker | null = null;

export function getTracker(): Tracker {
    if (!trackerInstance) {
        trackerInstance = new Tracker();
    }
    return trackerInstance;
}

export const initTracking = () => getTracker().init();
export const trackPageView = (url?: string, title?: string) => getTracker().trackPageView(url, title);
export const trackEvent = (type: string, data?: Record<string, unknown>) => getTracker().trackEvent(type, data);
export const trackCheckout = (step: string, items: unknown[], total: number, email?: string, phone?: string) =>
    getTracker().trackCheckout(step, items, total, email, phone);

export const EVENTS = {
    ADD_TO_CART: "add_to_cart",
    REMOVE_FROM_CART: "remove_from_cart",
    VIEW_PRODUCT: "view_product",
    SEARCH: "search",
    CHECKOUT_START: "checkout_start",
    CHECKOUT_STEP: "checkout_step",
    PURCHASE: "purchase",
    CLICK: "click",
    SCROLL: "scroll",
};
