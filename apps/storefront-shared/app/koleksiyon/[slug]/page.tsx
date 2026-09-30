import { generateCollectionMetadata, renderCollectionPage } from "../../collections/[slug]/render-collection-page.tsx";
export const generateMetadata = generateCollectionMetadata;
export default function CollectionPage(props: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }>) { return renderCollectionPage({ ...props, routeVariant: "localized" }); }
