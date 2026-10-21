import { StorefrontFrame } from "../../../../../../../apps/storefront-shared/components/StorefrontFrame";
import { HizliProductDetail } from "../../../../../../../apps/storefront-shared/themes/hizli-kutu/HizliProductDetail";
import {storefront,design,products,presentation} from "../../data";
import {notFound} from "next/navigation";
export default async function Page({params}:{params:Promise<{slug:string}>}) {const {slug}=await params;const p=products.find(p=>p.slug===slug);if(!p)notFound();return <StorefrontFrame storefront={storefront} design={design}><HizliProductDetail product={p} locale="tr" relatedProducts={products.filter(item=>item.id!==p.id).slice(0,4)} publishedPolicies={[]} options={presentation.productDetail} cardStyle="compact" imageRatio="square" showQuantitySelector/></StorefrontFrame> }
