import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { openInvitationRequest, sealInvitationRequest } from "./request-seal.ts";

const request = { from: "sender@example.com", to: "recipient@example.com", subject: "Davet", html: "<p>İçerik</p>", text: "İçerik\nLink" };
const context = { invitationId: "123e4567-e89b-42d3-a456-426614174000", generation: 1 };
const keys = { activeKeyId: "invite_01", keys: { invite_01: Buffer.alloc(32, 7) } };
test("ar1 preserves exact rendered fields and rejects context, metadata, digest and tag tampering", () => {
  const sealed = sealInvitationRequest(request, context, keys);
  assert.equal(sealed.version, "ar1");
  assert.deepEqual(openInvitationRequest(sealed, context, keys), request);
  assert.notDeepEqual(sealInvitationRequest(request, context, keys).bytes, sealed.bytes);
  assert.equal(sealed.bytes.includes(Buffer.from(request.to)), false);
  const bytes = Buffer.from(sealed.bytes); bytes[15] ^= 1;
  for (const operation of [
    () => openInvitationRequest(sealed, { ...context, generation: 2 }, keys),
    () => openInvitationRequest({ ...sealed, version: "ai1" } as never, context, keys),
    () => openInvitationRequest({ ...sealed, digest: "0".repeat(64) }, context, keys),
    () => openInvitationRequest({ ...sealed, bytes, digest: createHash("sha256").update(bytes).digest("hex") }, context, keys),
    () => sealInvitationRequest({ ...request, token: "secret" } as never, context, keys),
    () => sealInvitationRequest({ ...request, to: "UPPER@example.com" }, context, keys),
    () => sealInvitationRequest({ ...request, subject: "x\nInjected" }, context, keys),
    () => sealInvitationRequest(request, context, { activeKeyId: "invite_01", keys: { invite_01: Buffer.alloc(31) } }),
    () => sealInvitationRequest(request, { ...context, generation: 0 }, keys),
    () => sealInvitationRequest({ ...request, html: "x".repeat(65_536) }, context, keys),
  ]) assert.throws(operation, /^Error: store_admin_invitation_request_seal_invalid$/);
  assert.deepEqual(keys.keys.invite_01, Buffer.alloc(32, 7));
});

test("real crypto transient key and plaintext buffers are wiped on success and tag failure", () => {
  const url = new URL("./request-seal.ts", import.meta.url).href;
  const wrapper = `import * as real from 'node:crypto';
    export const createHash=real.createHash, randomBytes=real.randomBytes, timingSafeEqual=real.timingSafeEqual;
    globalThis.buffers=[];
    function wrap(name,args){ globalThis.buffers.push(args[1]); const c=real[name](...args); return new Proxy(c,{get(t,p){ if(p==='update'||p==='final')return(...a)=>{if(name==='createCipheriv'&&p==='update')globalThis.buffers.push(a[0]); const b=t[p](...a);if(name==='createDecipheriv')globalThis.buffers.push(b);return b;};const v=t[p];return typeof v==='function'?v.bind(t):v;}});}
    export const createCipheriv=(...a)=>wrap('createCipheriv',a), createDecipheriv=(...a)=>wrap('createDecipheriv',a);`;
  const child = `import assert from 'node:assert/strict';import {registerHooks} from 'node:module';import {createHash} from 'node:crypto';
    registerHooks({resolve(s,c,n){return s==='node:crypto'&&c.parentURL===${JSON.stringify(url)}?{shortCircuit:true,url:${JSON.stringify(`data:text/javascript,${encodeURIComponent(wrapper)}`)}}:n(s,c);}});
    const {sealInvitationRequest,openInvitationRequest}=await import(${JSON.stringify(url)});
    const request=${JSON.stringify(request)},context=${JSON.stringify(context)},keys={activeKeyId:'invite_01',keys:{invite_01:Buffer.alloc(32,7)}};
    const seal=sealInvitationRequest(request,context,keys);openInvitationRequest(seal,context,keys);
    const bytes=Buffer.from(seal.bytes);bytes[15]^=1;
    assert.throws(()=>openInvitationRequest({...seal,bytes,digest:createHash('sha256').update(bytes).digest('hex')},context,keys));
    assert.ok(globalThis.buffers.length>=6);assert.ok(globalThis.buffers.every(b=>b.every(v=>v===0)));assert.deepEqual(keys.keys.invite_01,Buffer.alloc(32,7));`;
  const childResult = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", child], { encoding: "utf8" });
  assert.equal(childResult.status, 0, childResult.stderr);
});
