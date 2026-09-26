import assert from 'node:assert/strict';
import test from 'node:test';
import {readInStoreMutationInput,readInStoreProductsInput,readInStoreSalesInput} from './request-input.ts';
const id='11111111-1111-4111-8111-111111111111';
function request(body:unknown,headers:Record<string,string>={}) {return new Request('https://panel.example/api/orders/in-store/sales',{method:'POST',headers:{'content-type':'application/json','idempotency-key':id,...headers},body:JSON.stringify(body)});}
const intent={locationId:id,items:[{variantId:id,quantity:1}],discount:null,customerName:null,note:null};
test('commands accept only versioned exact server-priced intent and one UUID key',async()=>{
  assert.deepEqual(await readInStoreMutationInput(request({saleId:id,intent}),'create'),{operationId:id,value:{saleId:id,intent}});
  for(const body of [{saleId:id,intent,storeId:id},{expectedVersion:0,intent},{expectedVersion:1,intent:{...intent,items:[{variantId:id,quantity:1,unitPriceCents:1}]}}]) {
    assert.equal(await readInStoreMutationInput(request(body),'update'),null);
  }
  assert.equal(await readInStoreMutationInput(request({expectedVersion:1},{'idempotency-key':`${id},${id}`}),'complete'),null);
  assert.equal(await readInStoreMutationInput(request({expectedVersion:1,confirmUnpaid:false}),'cancel'),null);
});
test('body size, invalid JSON and wrong encoding fail before command dispatch',async()=>{
  assert.equal(await readInStoreMutationInput(request({saleId:id,intent:{...intent,note:'x'.repeat(40000)}}),'create'),null);
  assert.equal(await readInStoreMutationInput(request({expectedVersion:1},{'content-type':'text/plain'}),'complete'),null);
});
test('barcode lookup preserves leading zeros and rejects ambiguous query authority',()=>{
  assert.deepEqual(readInStoreProductsInput(new Request(`https://panel.example/api/orders/in-store/products?locationId=${id}&barcode=0012345678905&limit=1`)),{locationId:id,barcode:'0012345678905',limit:1});
  for(const query of [`locationId=${id}&barcode=a&query=b`,`locationId=${id}&barcode=a&barcode=b`,`locationId=${id}&query=x&storeId=${id}`])assert.equal(readInStoreProductsInput(new Request(`https://panel.example/?${query}`)),null);
  assert.equal(readInStoreSalesInput(new Request('https://panel.example/?status=pending&pageSize=51')),null);
});
