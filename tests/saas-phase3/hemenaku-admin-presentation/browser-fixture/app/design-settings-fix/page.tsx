import { readFixture } from "./fixture-store";
import { DesignFixFixture } from "./workspace";
import { designFixturePreviewResources } from "./preview-resources";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{sections?:string;theme?:string}>}) {
 const query=await searchParams;
 let workspace=await readFixture();
 if(query.sections==="50")workspace={...workspace,design:{...workspace.design,composition:{...workspace.design.composition,sections:Array.from({length:50},(_,index)=>{const original=workspace.design.composition.sections[index%workspace.design.composition.sections.length]!;return {...original,sectionId:`home_fixture_${index}` as const,...(original.kind==="banner"?{slides:original.slides.map((slide,slideIndex)=>({...slide,slideId:`slide_fixture_${index}_${slideIndex}`}))}:{})};})}}};
 const storefront=query.theme==="guzide"?{id:"a828862c-4cc1-475a-89cc-5fbee31eb43f",hostname:"fixture.invalid",canonicalUrl:"https://fixture.invalid/",locale:"tr" as const,currency:"TRY" as const}:undefined;
 return <DesignFixFixture workspace={workspace} storefront={storefront} initialPreviewResources={await designFixturePreviewResources(workspace)}/>;
}
