import { isIP } from "node:net";

import { isPublicCatalogFeedAddress, validateCatalogFeedUrl } from "../catalog-import/feed-authority.ts";

const LOCAL_SUFFIX = /\.(?:internal|lan|home|localhost|local)$/i;

/** The URL is serialized exactly as supplied, so redirects cannot change authority by parser repair. */
export function validateContentResearchUrl(value: unknown): string {
  let selected: string;
  try { selected = validateCatalogFeedUrl(value); }
  catch { throw new Error("content_research_url_invalid"); }
  const hostname = new URL(selected).hostname;
  // URL.hostname keeps brackets on IPv6 literals; node:net.isIP does not.
  if (hostname.startsWith("[") || hostname.endsWith("]") || hostname.endsWith(".") || LOCAL_SUFFIX.test(hostname)) throw new Error("content_research_url_invalid");
  return selected;
}

/** DNS results must match their declared family and be globally routable. */
export function isPublicContentResearchAddress(address: string, family: 4 | 6): boolean {
  return typeof address === "string" && isIP(address) === family && isPublicCatalogFeedAddress(address);
}
