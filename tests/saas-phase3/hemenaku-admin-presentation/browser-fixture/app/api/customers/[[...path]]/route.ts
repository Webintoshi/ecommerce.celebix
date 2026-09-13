// Local acceptance fixture: no DB, session, credentials, provider or persistence.
import { GET as existingFixtureGet } from "../../[...slug]/route";
const now="2026-09-09T12:00:00.000Z";
const id="81000000-0000-4000-8000-000000000001";
const tag={id:"84000000-0000-4000-8000-000000000001",name:"Tekrar alışveriş",color:"#2b2b2b",customerCount:2,version:1};
const segment={id:"85000000-0000-4000-8000-000000000001",name:"Sadakat grubu",kind:"manual",description:"Kontrollü QA grubu",customerCount:2,version:1};
const item={id,status:"active",displayName:"Ada QA",firstName:"Ada",lastName:"QA",email:"ada@example.test",phone:"+905551112233",orderCount:2,totalSpentCents:25000,currency:"TRY",tags:[{id:tag.id,name:tag.name,color:tag.color}],version:1,createdAt:now,updatedAt:now};
const items=[item,{...item,id:"81000000-0000-4000-8000-000000000002",displayName:"Deniz QA",firstName:"Deniz",email:"deniz@example.test",orderCount:0,totalSpentCents:0,tags:[]}];
export async function GET(request:Request,{params}:{params:Promise<{path?:string[]}>}){
  const path=(await params).path??[], url=new URL(request.url);
  // Preserve the acceptance app's existing assistant/dashboard fixture cases.
  if(path.length===0&&url.searchParams.get("pageSize")==="10"&&url.searchParams.get("search")&&url.searchParams.size===2)return existingFixtureGet(request,{params:Promise.resolve({slug:["customers"]})});
  if(path[0]==="summary"&&!/\/(?:mira-customers|customers)(?:\/|$)/.test(new URL(request.headers.get("referer")??request.url).pathname))return existingFixtureGet(request,{params:Promise.resolve({slug:["customers","summary"]})});
  if(path[0]==="22222222-2222-4222-8222-222222222222")return existingFixtureGet(request,{params:Promise.resolve({slug:["customers",...path]})});
  if(path[0]==="summary")return Response.json({active:2,archived:0,consentedEmail:1,totalSpentCents:25000,currency:"TRY",asOf:now});
  if(path[0]==="tags")return Response.json({items:[tag]});
  if(path[0]==="segments")return Response.json({items:[segment]});
  if(path[0]==="export")return Response.json({items,exportedAt:now});
  const current=items.find(row=>row.id===path[0]);
  if(path.length&&!current)return Response.json({code:"not_found"},{status:404});
  if(path[1]==="workspace")return Response.json({neighbors:current?.id===id?{next:{id:items[1].id,displayName:items[1].displayName}}:{previous:{id:item.id,displayName:item.displayName}},orders:[]});
  if(current)return Response.json({...current,addresses:[],consents:[{channel:"email",status:"granted",recordedAt:now}],notes:[],segments:[]});
  const search=(url.searchParams.get("search")??"").toLocaleLowerCase("tr-TR");
  return Response.json({items:url.searchParams.get("status")==="archived"?[]:items.filter(row=>row.displayName.toLocaleLowerCase("tr-TR").includes(search))});
}
export async function POST(){return Response.json({code:"version_conflict"},{status:409});}
