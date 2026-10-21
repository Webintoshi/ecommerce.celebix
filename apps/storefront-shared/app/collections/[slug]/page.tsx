import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
import { generateCollectionMetadata, renderCollectionPage } from "./render-collection-page.tsx";
export const generateMetadata = generateCollectionMetadata;
function CollectionPage(props: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }>) { return renderCollectionPage({ ...props, routeVariant: "legacy" }); }

export default withCommercePolicyPage(CollectionPage);
