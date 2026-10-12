import assert from "node:assert/strict";
import test from "node:test";
import { createAdminLoginSecurityTransport } from "./transport.ts";
import { createAdminLoginInternalGateway } from "../../../../packages/saas-data/src/admin-login-security/internal.ts";
test("panel transport performs real authenticated owner request and verifies response before returning private result",async()=>{
 const secret=new Uint8Array(32).fill(11),keyId="key",ownerOrigin="https://owner.test",clock=()=>new Date("2026-10-12T12:00:00.000Z"),calls:any[]=[];
 const gateway=createAdminLoginInternalGateway({ownerOrigin,keys:new Map([[keyId,secret]]),clock,handle:async command=>{calls.push(command);return{schemaVersion:1,code:"ok",state:{phase:"code"}};}});
 const adapter=createAdminLoginSecurityTransport({ownerOrigin,keyId,secret,clock,fetch:async input=>gateway(input as Request)});
 assert.deepEqual(await adapter.execute({schemaVersion:1,action:"state",pendingCookie:"apc1.private",browserCredential:"pb1.private"}),{schemaVersion:1,code:"ok",state:{phase:"code"}});assert.equal(calls.length,1);
 const tampered=createAdminLoginSecurityTransport({ownerOrigin,keyId,secret,clock,fetch:async()=>Response.json({schemaVersion:1,code:"ok",completion:{sessionCredential:"secret"}})});await assert.rejects(tampered.execute({schemaVersion:1,action:"state"}));
});
