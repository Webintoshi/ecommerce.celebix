import { VariantGalleryFixture } from './screen';
export default async function Page({searchParams}: {searchParams:Promise<{scenario?:string}>}) {
 const {scenario}=await searchParams;
 return <VariantGalleryFixture scenario={scenario ?? 'normal'} />;
}
