import { failNextFixtureSave, holdNextFixtureSave, mutateFixture, releaseFixtureSave, resetFixture } from "../../design-settings-fix/fixture-store";
export async function POST(request:Request){
 const {action}=await request.json();
 if(action==="fail-next-save")failNextFixtureSave();
 else if(action==="hold-next-save")holdNextFixtureSave();
 else if(action==="release-save")releaseFixtureSave();
 else if(action==="reset"){await resetFixture();(globalThis as typeof globalThis & {designApplyFixtureOperations?:Map<string,unknown>}).designApplyFixtureOperations?.clear();}
 else if(action==="remote-edit")await mutateFixture(current=>({workspace:{...current,publishedVersion:current.publishedVersion+1,publishedAt:new Date().toISOString(),design:{...current.design,promotion:{...current.design.promotion,headline:"Diğer izole oturumun tasarımı"}}},result:undefined}));
 else return Response.json({code:"invalid_input"},{status:400});
 return Response.json({code:"ok"});
}
