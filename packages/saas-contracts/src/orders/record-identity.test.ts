import assert from "node:assert/strict";
import test from "node:test";
import {parseOrderDeliveryId, parseOrderEventId} from "./record-identity.ts";

test("record identity syntax stays canonical and does not coerce malformed inputs",()=>{
  const valid="af7fb97c-bcb3-7d86-ec85-fd4f0c49d91f";
  for(const parse of [parseOrderDeliveryId,parseOrderEventId]){
    assert.equal(parse(valid),valid);
    assert.equal(parse("11111111-1111-4111-8111-111111111111"),"11111111-1111-4111-8111-111111111111");
    for(const bad of [null,undefined,12,{},[],"",valid.toUpperCase(),` ${valid}`,`${valid} `,`${valid}\n`,`${valid}\0`,valid.replaceAll("-",""),valid.replace("f","g"),`${valid}' OR 1=1`,`${valid}/../x`]) {
      assert.throws(()=>parse(bad),/order_contract_invalid/);
    }
  }
});
