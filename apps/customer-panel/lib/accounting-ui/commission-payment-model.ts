import {ACCOUNTING_COMMISSION_PAYMENT_ACTIONS,accountingUuid,parseAccountingCommissionPaymentIntent,parseAccountingCommissionPaymentResult,accountingCommissionPaymentResultMatches,type AccountingAccount,type AccountingCommissionBalance,type AccountingCommissionPaymentAction,type AccountingCommissionPaymentIntentMap,type AccountingCommissionPaymentResult} from '@celebix/saas-contracts';

export type CommissionPaymentCommand={key:string;displayName:string;phoneMasked:string|null;accountName:string}&{[K in AccountingCommissionPaymentAction]:{kind:K;intent:AccountingCommissionPaymentIntentMap[K]}}[AccountingCommissionPaymentAction];
export const commissionPaymentStorageKey=(scopeKey:string)=>`celebix-accounting-commission-payment:${scopeKey}`;
export function parseStoredCommissionPaymentCommand(value:unknown):CommissionPaymentCommand{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('invalid_commission_payment_command');
 const row=value as Record<string,unknown>,keys=['key','kind','displayName','phoneMasked','accountName','intent'];
 const label=(input:unknown,max:number)=>typeof input==='string'&&input.length>0&&input.length<=max&&input===input.trim()&&!/[\u0000-\u001f\u007f]/.test(input);
 if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key))||!(ACCOUNTING_COMMISSION_PAYMENT_ACTIONS as readonly unknown[]).includes(row.kind)||!label(row.displayName,320)||!label(row.accountName,200)||row.phoneMasked!==null&&!label(row.phoneMasked,80))throw new TypeError('invalid_commission_payment_command');
 const kind=row.kind as AccountingCommissionPaymentAction,intent=parseAccountingCommissionPaymentIntent(kind,row.intent);
 return Object.freeze({key:accountingUuid(row.key),kind,displayName:row.displayName,phoneMasked:row.phoneMasked,accountName:row.accountName,intent}) as CommissionPaymentCommand;
}
export function bindCommissionPaymentResult(command:CommissionPaymentCommand,value:unknown):AccountingCommissionPaymentResult{
 const result=parseAccountingCommissionPaymentResult(value);
 if(!accountingCommissionPaymentResultMatches(result,command.kind,command.intent,command.key))throw new TypeError('commission_payment_result_mismatch');
 return result;
}
export function commissionPaymentPreview(balance:Pick<AccountingCommissionBalance,'currency'|'earnedCommissionCents'|'paidCents'|'dueCents'|'overpaidCents'>,account:Pick<AccountingAccount,'currency'|'type'|'balanceCents'>|null,amount:number|null,reverse=false){
 const fail=(error:string)=>({dueBeforeCents:balance.dueCents,dueAfterCents:null,overpaidBeforeCents:balance.overpaidCents,overpaidAfterCents:null,balanceBeforeCents:account?.balanceCents??null,balanceAfterCents:null,error});
 if(amount===null||!Number.isSafeInteger(amount)||amount<1)return fail('Ödediğin tutarı gir.');
 if(!account)return fail('Paranın çıktığı kasa veya banka hesabını seç.');
 if(!['cash','bank'].includes(account.type)||account.currency!==balance.currency)return fail('Aynı para biriminde bir kasa veya banka hesabı seç.');
 if(![balance.earnedCommissionCents,balance.paidCents,balance.dueCents,balance.overpaidCents,account.balanceCents].every(value=>Number.isSafeInteger(value)&&value>=0))return fail('Güncel tutarları yeniden yükle.');
 if(!reverse&&amount>balance.dueCents)return fail('Ödeme kalan prim borcunu aşamaz.');
 if(!reverse&&amount>account.balanceCents)return fail('Seçilen hesapta yeterli para yok.');
 if(reverse&&amount>balance.paidCents)return fail('Ödeme kaydı değişti. Güncel kaydı aç.');
 const paid=BigInt(balance.paidCents)+(reverse?-1n:1n)*BigInt(amount),earned=BigInt(balance.earnedCommissionCents),nextBalance=BigInt(account.balanceCents)+(reverse?1n:-1n)*BigInt(amount),limit=BigInt(Number.MAX_SAFE_INTEGER),due=earned>paid?earned-paid:0n,overpaid=paid>earned?paid-earned:0n;
 if(paid<0n||paid>limit||nextBalance<0n||nextBalance>limit||due>limit||overpaid>limit)return fail('Tutar hesap sınırını aşıyor. Güncel kayıtları kontrol et.');
 return{dueBeforeCents:balance.dueCents,dueAfterCents:Number(due),overpaidBeforeCents:balance.overpaidCents,overpaidAfterCents:Number(overpaid),balanceBeforeCents:account.balanceCents,balanceAfterCents:Number(nextBalance),error:null};
}
