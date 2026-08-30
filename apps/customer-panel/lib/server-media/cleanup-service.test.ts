import assert from "node:assert/strict";
import test from "node:test";
import { createArchivedProductMediaCleanupService } from "./cleanup-service.ts";

const STORE="10000000-0000-4000-8000-000000000001",PRODUCT="20000000-0000-4000-8000-000000000001",MEDIA="30000000-0000-4000-8000-000000000001",OPERATION="40000000-0000-4000-8000-000000000001";
const KEY=`stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`;
const tenantContext={ store:{ id:STORE } } as any;

test("cleanup records deletion only after exact storage absence proof",async()=>{
  const calls:string[]=[];
  const service=createArchivedProductMediaCleanupService({
    repository:{
      async claimArchivedProductMediaCleanup(){calls.push("claim");return {mediaId:MEDIA,productId:PRODUCT,objectKey:KEY,mediaType:"image/webp",byteSize:12,expectedVersion:4};},
      async recordArchivedProductMediaObjectDeleted(){calls.push("proof");return {media:{id:MEDIA},replayed:false};},
    } as any,
    storage:{async delete(key:string){assert.equal(key,KEY);calls.push("delete");},async head(key:string){assert.equal(key,KEY);calls.push("head");return {kind:"not_found"};}} as any,
  });
  await service.cleanup({tenantContext,now:new Date("2026-08-30T00:00:00.000Z"),operationId:OPERATION,productId:PRODUCT,mediaId:MEDIA,expectedVersion:4});
  assert.deepEqual(calls,["claim","delete","head","proof"]);
});

test("cleanup never records SQL proof while storage still exists",async()=>{
  let proofs=0;
  const service=createArchivedProductMediaCleanupService({repository:{async claimArchivedProductMediaCleanup(){return {mediaId:MEDIA,productId:PRODUCT,objectKey:KEY,mediaType:"image/webp",byteSize:12,expectedVersion:4};},async recordArchivedProductMediaObjectDeleted(){proofs+=1;}} as any,storage:{async delete(){},async head(){return {kind:"found"};}} as any});
  await assert.rejects(()=>service.cleanup({tenantContext,now:new Date(),operationId:OPERATION,productId:PRODUCT,mediaId:MEDIA,expectedVersion:4}),/proof_missing/);
  assert.equal(proofs,0);
});
