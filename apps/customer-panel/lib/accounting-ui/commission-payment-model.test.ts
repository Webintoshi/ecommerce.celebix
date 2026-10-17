import assert from 'node:assert/strict';
import test from 'node:test';
import {commissionPaymentPreview,commissionPaymentStorageKey,parseStoredCommissionPaymentCommand} from './commission-payment-model.ts';
const membershipId='11111111-1111-4111-8111-111111111111',accountId='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333',token='a'.repeat(64);
const balance={membershipId,displayName:'Ayçin Azaklı',phoneMasked:'+90 •••••• 0012',currency:'TRY' as const,earnedCommissionCents:240000,paidCents:40000,dueCents:200000,overpaidCents:0,balanceToken:token};
const account={currency:'TRY',type:'bank' as const,balanceCents:500000};
const command={key,kind:'pay',displayName:balance.displayName,phoneMasked:balance.phoneMasked,accountName:'İşletme bankası',intent:{membershipId,accountId,amountCents:80000,currency:'TRY',occurredOn:'2026-10-17',note:'İlk parça',expectedBalanceToken:token,expectedAccountVersion:3}};
test('partial payout shows precise due and cash or bank impact without changing entitlement',()=>{
 assert.deepEqual(commissionPaymentPreview(balance,account,80000),{dueBeforeCents:200000,dueAfterCents:120000,overpaidBeforeCents:0,overpaidAfterCents:0,balanceBeforeCents:500000,balanceAfterCents:420000,error:null});
 assert.equal(commissionPaymentPreview(balance,account,200001).error,'Ödeme kalan prim borcunu aşamaz.');
 assert.equal(commissionPaymentPreview(balance,{...account,balanceCents:50000},80000).error,'Seçilen hesapta yeterli para yok.');
 assert.equal(commissionPaymentPreview(balance,{...account,type:'card' as any},100).balanceAfterCents,null);
 assert.equal(commissionPaymentPreview(balance,{...account,currency:'USD'},100).balanceAfterCents,null);
});
test('reversing an overpaid record first removes the advance and then restores unpaid commission',()=>{
 const overpaid={...balance,earnedCommissionCents:30000,paidCents:50000,dueCents:0,overpaidCents:20000};
 assert.deepEqual(commissionPaymentPreview(overpaid,account,40000,true),{dueBeforeCents:0,dueAfterCents:20000,overpaidBeforeCents:20000,overpaidAfterCents:0,balanceBeforeCents:500000,balanceAfterCents:540000,error:null});
 assert.equal(commissionPaymentPreview(overpaid,account,50001,true).balanceAfterCents,null);
 assert.equal(commissionPaymentPreview(balance,{...account,balanceCents:Number.MAX_SAFE_INTEGER},1,true).balanceAfterCents,null);
});
test('persisted commands bind all fields to their scoped key and reject altered or incomplete input',()=>{
 assert.equal(commissionPaymentStorageKey('store:actor'),'celebix-accounting-commission-payment:store:actor');
 assert.deepEqual(parseStoredCommissionPaymentCommand(command),command);
 assert.equal(parseStoredCommissionPaymentCommand({...command,displayName:'x'.repeat(320)}).displayName.length,320);
 for(const altered of [{...command,extra:true},{...command,key:'bad'},{...command,displayName:''},{...command,phoneMasked:'x'.repeat(81)},{...command,intent:{...command.intent,amountCents:0}},{...command,intent:{...command.intent,expectedBalanceToken:'bad'}}])assert.throws(()=>parseStoredCommissionPaymentCommand(altered));
});
