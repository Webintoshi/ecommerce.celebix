import { normalizeStorefrontDesignDocumentV5 } from "@celebix/saas-contracts";
import { createPreviewStorefrontDesign } from "@celebix/storefront-design-ui";
import { consumeFixtureFailure, mutateFixture, readFixture, waitForFixtureSaveRelease } from "../../../design-settings-fix/fixture-store";
import { designFixturePreviewResources } from "../../../design-settings-fix/preview-resources";
const state=globalThis as typeof globalThis & { designApplyFixtureOperations?:Map<string,{signature:string;result:unknown}> };
export async function GET() { return Response.json({ code: "found", workspace: await readFixture() }); }
export async function POST(request: Request) {
 const input=await request.json();
 if(new URL(request.url).pathname==="/api/storefront-design/preview")return Response.json({code:"ok",resources:await designFixturePreviewResources(await readFixture(),input.composition,input.previewProductId)});
 if(new URL(request.url).pathname!=="/api/storefront-design/apply")return Response.json({code:"not_found"},{status:404});
 const operationId=request.headers.get("idempotency-key");if(!operationId)return Response.json({code:"invalid_input"},{status:400});
 let design:ReturnType<typeof normalizeStorefrontDesignDocumentV5>;try{design=normalizeStorefrontDesignDocumentV5(input.design);}catch{return Response.json({code:"invalid_input"},{status:400});}
 const signature=JSON.stringify({expectedPublishedVersion:input.expectedPublishedVersion,design});
 if(consumeFixtureFailure())return Response.json({code:"unavailable"},{status:503});
 await waitForFixtureSaveRelease();
 return mutateFixture(current=>{
  const operations=state.designApplyFixtureOperations??=new Map();const prior=operations.get(operationId);
  if(prior)return prior.signature===signature?{result:Response.json({code:"applied",result:prior.result})}:{result:Response.json({code:"operation_mismatch"},{status:409})};
  if(input.expectedPublishedVersion!==current.publishedVersion)return {result:Response.json({code:"version_conflict"},{status:409})};
  const publishedVersion=current.publishedVersion+1,publishedAt=new Date().toISOString();const published=createPreviewStorefrontDesign({draft:design,publishedVersion,publishedAt,media:current.media,destinations:current.destinations});
  const result={design,publishedVersion,publishedAt,published};operations.set(operationId,{signature,result});
  return {workspace:{...current,design,publishedVersion,publishedAt},result:Response.json({code:"applied",result})};
 });
}
