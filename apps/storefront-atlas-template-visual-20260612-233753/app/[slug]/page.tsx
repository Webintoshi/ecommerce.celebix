import CollectionPage, {
  generateMetadata as generateCollectionMetadata,
} from "../koleksiyon/[slug]/page";
import { notFound } from "next/navigation";

export const revalidate = 300;

const REMOVED_MODULE_SLUGS = new Set(["sans-carki", "lucky-wheel"]);

export async function generateMetadata(
  props: Parameters<typeof generateCollectionMetadata>[0],
) {
  const { slug } = await props.params;
  if (REMOVED_MODULE_SLUGS.has(slug)) {
    return {};
  }

  return generateCollectionMetadata(props);
}

export default async function StorefrontAliasPage(
  props: Parameters<typeof CollectionPage>[0],
) {
  const { slug } = await props.params;
  if (REMOVED_MODULE_SLUGS.has(slug)) {
    notFound();
  }

  return CollectionPage(props);
}
