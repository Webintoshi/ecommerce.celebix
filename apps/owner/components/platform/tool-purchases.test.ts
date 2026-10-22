import assert from 'node:assert/strict';
import test from 'node:test';
import type {StoreToolPurchase} from '@celebix/saas-contracts';
import {settleToolPurchaseCommand} from './tool-purchases.ts';

const purchase={id:'20000000-0000-4000-8000-000000000001',storeId:'30000000-0000-4000-8000-000000000001',storeName:'Test mağaza',offerId:'contact_widget',offerName:'İletişim balonu',status:'pending',version:1,createdAt:'2026-10-22T12:00:00.000Z',netCents:99000,vatBps:2000,vatCents:19800,totalCents:118800,currency:'TRY',toolKeys:['contact_widget'],settledAt:null,receipt:null} as const satisfies StoreToolPurchase;
test('tool settlement command fixes the quoted gross price and requires verified receipt evidence',()=>{
 const command=settleToolPurchaseCommand(purchase);assert.equal(command.endpoint,'/api/platform/tool-purchases');assert.equal(command.action,'tool.purchase.settle');assert.equal(command.expectedVersion,1);assert.ok(command.description.includes('gerçek'));assert.ok(command.description.includes('1.188'));
 assert.equal(command.fields.find(field=>field.name==='amount')?.readOnly,true);assert.deepEqual(command.payload({amount:'0,01',method:'bank_transfer',reference:'  Dekont 42  ',reason:'  Banka hesabına gelen ödeme doğrulandı.  '}),{purchaseId:purchase.id,storeId:purchase.storeId,amountCents:118800,method:'bank_transfer',reference:'Dekont 42',reason:'Banka hesabına gelen ödeme doğrulandı.'});
 for(const draft of [{method:'bank_transfer',reference:'',reason:'Doğrulandı'},{method:'bank_transfer',reference:'Dekont',reason:''},{method:'browser_success',reference:'Dekont',reason:'Doğrulandı'}])assert.throws(()=>command.payload(draft));
});
test('settled purchases cannot create a second settlement command',()=>{assert.throws(()=>settleToolPurchaseCommand({...purchase,status:'settled',version:2,settledAt:'2026-10-22T12:10:00.000Z',receipt:{method:'bank_transfer',reference:'Dekont',amountCents:118800}}));});
