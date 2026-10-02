export function parseCatalogSearchConfig(source: Readonly<Record<string, string | undefined>>, purpose: "search" | "worker" = "search"): Readonly<{ url: string; apiKey: string; index: string }> | null {
  if (purpose === "worker" && source.CELEBIX_SEARCH_WORKER_ENABLED !== "true") return null;
  if (!source.CELEBIX_SEARCH_URL && !source.CELEBIX_SEARCH_API_KEY) return null;
  const invalid = () => { throw new Error("catalog_search_config_invalid"); };
  let url: URL; try { url = new URL(source.CELEBIX_SEARCH_URL!); } catch { return invalid(); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !["http:", "https:"].includes(url.protocol) || (url.protocol === "http:" && url.origin !== "http://celebix-catalog-search:7700")) return invalid();
  const apiKey = purpose === "worker" ? source.CELEBIX_SEARCH_WRITE_API_KEY : source.CELEBIX_SEARCH_API_KEY;
  if (!apiKey || !/^[A-Za-z0-9_-]{16,256}$/u.test(apiKey)) return invalid();
  const index = source.CELEBIX_SEARCH_INDEX ?? "celebix_products_v1";
  if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(index)) return invalid();
  return Object.freeze({ url: url.origin, apiKey, index });
}
