import { readFixture } from "./fixture-store";
import { DesignFixFixture } from "./workspace";
import { designFixturePreviewResources } from "./preview-resources";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{sections?:string}>}) {
 let workspace=await readFixture();
 if((await searchParams).sections==="50")workspace={...workspace,design:{...workspace.design,composition:{...workspace.design.composition,sections:Array.from({length:50},(_,index)=>{const original=workspace.design.composition.sections[index%workspace.design.composition.sections.length]!;return {...original,sectionId:`home_fixture_${index}` as const,...(original.kind==="banner"?{slides:original.slides.map((slide,slideIndex)=>({...slide,slideId:`slide_fixture_${index}_${slideIndex}`}))}:{})};})}}};
 return <DesignFixFixture workspace={workspace} initialPreviewResources={await designFixturePreviewResources(workspace)}/>;
}
