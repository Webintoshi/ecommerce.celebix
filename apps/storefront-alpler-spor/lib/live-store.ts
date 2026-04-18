// Simple in-memory store for active visitors
// In a production serverless environment (like Vercel), this would need Redis.
// For a single-instance VPS or Localhost, this works perfectly.

interface Visitor {
    id: string;
    lastSeen: number;
    userAgent: string;
    path: string;
}

// Global variable to persist across hot-reloads in development if possible
// (though Next.js clears standard globals often, this is "good enough" for accurate realtime checking)
const globalStore = global as unknown as { liveVisitors: Map<string, Visitor> };

if (!globalStore.liveVisitors) {
    globalStore.liveVisitors = new Map();
}

export const activeVisitors = globalStore.liveVisitors;

export function cleanupVisitors() {
    const now = Date.now();
    const TIMEOUT = 60 * 1000; // 1 minute timeout

    for (const [id, visitor] of activeVisitors.entries()) {
        if (now - visitor.lastSeen > TIMEOUT) {
            activeVisitors.delete(id);
        }
    }
}

export function trackVisitor(id: string, userAgent: string, path: string) {
    activeVisitors.set(id, {
        id,
        lastSeen: Date.now(),
        userAgent,
        path
    });
    cleanupVisitors(); // Clean up old ones while we're at it
}

export function getActiveVisitorCount(): number {
    cleanupVisitors();
    return activeVisitors.size;
}
