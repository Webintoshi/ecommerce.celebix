import { EZMEO_STOREFRONT_ID } from "../themes/ezmeo/theme.ts";
import { SIORA_STOREFRONT_ID } from "../themes/siora/theme.ts";

const productMediaOrigin = "https://media.saas-staging.celebix.site";
const storefrontIds = [EZMEO_STOREFRONT_ID, SIORA_STOREFRONT_ID] as const;

export function optimizedProductImageStorefront(src: string): typeof storefrontIds[number] | undefined {
  let url: URL;
  try { url = new URL(src); } catch { return undefined; }
  if (url.origin !== productMediaOrigin || url.username || url.password || url.search || url.hash ||
      !/\.(?:avif|jpe?g|png|webp)$/iu.test(url.pathname)) return undefined;
  return storefrontIds.find((storefrontId) => url.pathname.startsWith(`/stores/${storefrontId}/products/`));
}
