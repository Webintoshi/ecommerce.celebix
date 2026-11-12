import { EZMEO_STOREFRONT_ID } from "./theme.ts";

const productMediaPath = `/stores/${EZMEO_STOREFRONT_ID}/products/`;

const productMediaOrigin = "https://media.saas-staging.celebix.site";

export function isEzmeoProductImageSource(src: string): boolean {
  let url: URL;
  try { url = new URL(src); } catch { return false; }
  return url.origin === productMediaOrigin &&
    !url.username && !url.password && !url.search && !url.hash &&
    url.pathname.startsWith(productMediaPath) &&
    /\.(?:avif|jpe?g|png|webp)$/iu.test(url.pathname);
}
