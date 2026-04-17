export interface IndexingResult {
    success: boolean;
    message: string;
    provider: string;
}

/**
 * INDEXNOW IMPLEMENTATION
 * IndexNow is a protocol to instantly inform search engines about latest content changes.
 * Supported by: Bing, Yandex, Seznam.
 * 
 * To use IndexNow, you need:
 * 1. A host key (a random string).
 * 2. A file hosted at host_url/key_value.txt containing the key.
 */

// Generate a random key for IndexNow
export function generateIndexNowKey(): string {
    return Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 36).toString(36)
    ).join('');
}

// In a real app, this key should be stored in DB and served via a route.
// For this MVP, we'll store it in localStorage on the client side and 
// simulating the server-side check would require a proper backend route.
// We will implement the CLIENT-SIDE submission logic here, assuming the user 
// has placed the key file or we serve it dynamically (which we can't easily do in this static exportable context without API routes).
// However, we can simulate the API call to Bing/Yandex.

export async function submitToIndexNow(url: string, key: string, host: string): Promise<IndexingResult[]> {
    const providers = [
        { name: "Bing", endpoint: "https://www.bing.com/indexnow" },
        { name: "Yandex", endpoint: "https://yandex.com/indexnow" },
        // Google does NOT support IndexNow yet.
    ];

    const results: IndexingResult[] = [];

    const body = {
        host: host,
        key: key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: [url]
    };

    // Note: Browsers might block these requests due to CORS if called directly from client.
    // In a production Next.js app, this should be done via a server action or API route.
    // Since we are in a "client-side" dashboard for now, we will simulate the success 
    // or attempt it safely.

    // Real implementation would be:
    /*
    await fetch("https://www.bing.com/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    */

    // Call our own internal API route to handle the server-to-server request
    try {
        const response = await fetch('/api/seo/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host,
                key,
                urlList: [url]
            })
        });

        const data = await response.json();

        // IndexNow protocol shares data, so one successful call covers Bing/Yandex/Seznam
        if (data.success) {
            results.push({ success: true, message: "Bing & Yandex'e başarıyla iletildi (IndexNow).", provider: "IndexNow (Global)" });
        } else {
            results.push({ success: false, message: `Hata: ${data.message}`, provider: "IndexNow" });
        }

    } catch (error) {
        results.push({ success: false, message: "Sunucu bağlantı hatası.", provider: "API Error" });
    }

    return results;
}

/**
 * CLASSIC PING (SITEMAP)
 * Notifies engines to crawl the sitemap.
 */
export async function pingSearchEngines(sitemapUrl: string): Promise<IndexingResult[]> {
    const engines = [
        { name: "Google", url: `http://www.google.com/ping?sitemap=${sitemapUrl}` },
        { name: "Bing", url: `http://www.bing.com/ping?sitemap=${sitemapUrl}` },
    ];

    const results: IndexingResult[] = [];

    for (const engine of engines) {
        try {
            // Again, CORS might be an issue from client.
            // We typically use 'no-cors' mode just to fire and forget.
            await fetch(engine.url, { mode: 'no-cors' });
            results.push({ success: true, message: "Sinyal gönderildi.", provider: engine.name });
        } catch (e) {
            results.push({ success: false, message: "Bağlantı hatası.", provider: engine.name });
        }
    }

    return results;
}

/**
 * GOOGLE INDEXING API (Simulation)
 * This requires a Service Account JSON private key which is complex to setup.
 * We will provide a helper to generate the JSON required for the API.
 */
export function generateGoogleIndexingPayload(url: string, type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED") {
    return {
        url: url,
        type: type
    };
}
