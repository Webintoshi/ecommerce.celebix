type ImageCopies = Readonly<{ hash: string; widths: readonly number[]; originalWidth?: number }>;

const categoryBase = "https://media.saas-staging.celebix.site/stores/89e1e15f-8282-4e9b-ae3e-f417501bd54a/storefront/category/";

// Exact immutable sources keep later admin uploads authoritative.
const imageCopies: Readonly<Record<string, ImageCopies>> = {
  "/themes/lilyum/flower-atelier-v1.webp": { hash: "db2bbc2f4fd6", widths: [640, 960, 1440], originalWidth: 2164 },
  [`${categoryBase}ff72d131-f251-5fcb-92df-601d3fd1117a.webp`]: { hash: "4f00964e7455", widths: [320, 480], originalWidth: 600 },
  [`${categoryBase}38dea7f7-ee2a-50de-9793-1f430e3af96b.png`]: { hash: "b2808e9d39bb", widths: [320, 480, 640, 850] },
  [`${categoryBase}0e00ab0c-1aff-5175-a987-128d470bbddc.jpg`]: { hash: "38b79fd22cd7", widths: [320, 480, 560] },
  [`${categoryBase}3ade2b3c-11d6-522d-8cc0-ead71d1baff8.jpg`]: { hash: "c49ddc9d5bbe", widths: [320, 480, 600] },
};

export const LILYUM_COLLECTION_IMAGE_SIZES = "(max-width: 760px) calc((100vw - 42px) / 2), (max-width: 1100px) calc((100vw - 62px) / 2), (max-width: 1476px) calc((100vw - 110px) / 2), 683px";

export function lilyumImageSources(url: string, sizes: string, assetBaseUrl?: string): Readonly<{ src: string; srcSet?: string; sizes?: string }> {
  const assetUrl = (path: string) => assetBaseUrl && path.startsWith("/") ? new URL(path, assetBaseUrl).href : path;
  const src = assetUrl(url);
  const copies = imageCopies[url];
  if (!copies) return { src };
  const candidates = copies.widths.map(width => `${assetUrl(`/themes/lilyum/optimized/${copies.hash}-${width}.webp`)} ${width}w`);
  if (copies.originalWidth) candidates.push(`${src} ${copies.originalWidth}w`);
  return { src, srcSet: candidates.join(", "), sizes };
}
