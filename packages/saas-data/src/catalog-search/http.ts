import { assertCatalogSearchServer, boundedInteger, record, searchFailure } from "./common.ts";
import type { MeilisearchCatalogSearchOptions } from "./types.ts";

export class CatalogSearchHttp {
  readonly index: string;
  private readonly origin: string;
  private readonly apiKey: string;
  private readonly transport: typeof fetch;
  readonly timeoutMs: number;

  constructor(options: MeilisearchCatalogSearchOptions) {
    assertCatalogSearchServer();
    let url: URL;
    try { url = new URL(options.url); } catch { searchFailure(); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) searchFailure();
    if (typeof options.apiKey !== "string" || options.apiKey.length < 1 || options.apiKey.length > 4096 || /[\r\n]/.test(options.apiKey)) searchFailure();
    this.origin = url.origin;
    this.apiKey = options.apiKey;
    this.index = options.index ?? "celebix_products_v1";
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(this.index)) searchFailure();
    this.timeoutMs = boundedInteger(options.queryTimeoutMs ?? 1200, 1, 10_000);
    this.transport = options.fetch ?? globalThis.fetch;
    if (typeof this.transport !== "function") searchFailure();
  }

  async request(path: string, method = "GET", body?: unknown, timeoutMs = this.timeoutMs): Promise<Readonly<{ status: number; data: Record<string, unknown> }>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("catalog search deadline")); }, timeoutMs);
    });
    try {
      const operation = (async () => {
        const response = await this.transport(`${this.origin}${path}`, {
          method, headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal, redirect: "error", cache: "no-store",
        });
        const raw = await response.text();
        if (raw.length > 2_000_000) searchFailure();
        return { status: response.status, data: record(JSON.parse(raw)) };
      })();
      return await Promise.race([operation, deadline]);
    } catch { return searchFailure(); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
}
