import CollectionPage, {
  generateMetadata as generateCollectionMetadata,
} from "../koleksiyon/[slug]/page";

export const revalidate = 300;

export async function generateMetadata(
  props: Parameters<typeof generateCollectionMetadata>[0],
) {
  return generateCollectionMetadata(props);
}

export default CollectionPage;
