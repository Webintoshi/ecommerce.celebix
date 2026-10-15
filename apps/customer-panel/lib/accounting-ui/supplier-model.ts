import {ACCOUNTING_SUPPLIER_ACTIONS,accountingUuid,parseAccountingSupplierIntent,parseAccountingSupplierResult,accountingSupplierResultMatches,type AccountingAccount,type AccountingSupplierAction,type AccountingSupplierDebt,type AccountingSupplierIntentMap,type AccountingSupplierResult} from '@celebix/saas-contracts';
export type SupplierCommand={key:string;currency:string;supplierName:string;accountName:string|null}&{[K in AccountingSupplierAction]:{kind:K;intent:AccountingSupplierIntentMap[K]}}[AccountingSupplierAction];
export const supplierStorageKey=(scopeKey:string)=>`celebix-accounting-supplier:${scopeKey}`;
export function parseStoredSupplierCommand(value:unknown):SupplierCommand{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('invalid_supplier_command');
 const b=value as Record<string,unknown>,keys=['key','kind','currency','supplierName','accountName','intent'];
 const label=(v:unknown)=>typeof v==='string'&&v.length>=1&&v.length<=200&&v===v.trim()&&!/[\u0000-\u001f\u007f]/.test(v);
 if(Object.keys(b).length!==keys.length||keys.some(k=>!Object.hasOwn(b,k))||!(ACCOUNTING_SUPPLIER_ACTIONS as readonly unknown[]).includes(b.kind)||typeof b.currency!=='string'||!/^[A-Z]{3}$/.test(b.currency)||!label(b.supplierName)||b.accountName!==null&&!label(b.accountName))throw new TypeError('invalid_supplier_command');
 const kind=b.kind as AccountingSupplierAction,intent=parseAccountingSupplierIntent(kind,b.intent);
 if(kind==='createDebt'){const i=intent as AccountingSupplierIntentMap['createDebt'];if(i.supplierName!==b.supplierName||i.currency!==b.currency||b.accountName!==null)throw new TypeError('invalid_supplier_command');}
 else if(kind==='pay'){if((intent as AccountingSupplierIntentMap['pay']).currency!==b.currency||b.accountName===null)throw new TypeError('invalid_supplier_command');}
 else if(kind==='reversePayment'?b.accountName===null:b.accountName!==null)throw new TypeError('invalid_supplier_command');
 return Object.freeze({key:accountingUuid(b.key),kind,currency:b.currency,supplierName:b.supplierName,accountName:b.accountName,intent}) as SupplierCommand;
}
export function bindSupplierResult(command:SupplierCommand,value:unknown):AccountingSupplierResult{
 const result=parseAccountingSupplierResult(value);
 if(!accountingSupplierResultMatches(result,command.kind,command.intent,command.key)||result.debt.currency!==command.currency||result.debt.supplierName!==command.supplierName)throw new TypeError('supplier_result_mismatch');
 return result;
}
export const supplierStatusLabel=(status:AccountingSupplierDebt['status'])=>({unpaid:'Ödenmedi',partial:'Kısmen ödendi',paid:'Ödendi',cancelled:'İptal edildi'})[status];
export function supplierAmountText(cents:number):string{if(!Number.isSafeInteger(cents)||cents<0)throw new TypeError('invalid_supplier_amount');const amount=BigInt(cents);return`${amount/100n}.${String(amount%100n).padStart(2,'0')}`;}
export function supplierPaymentPreview(debt:Pick<AccountingSupplierDebt,'currency'|'amountCents'|'dueCents'|'status'>,account:Pick<AccountingAccount,'currency'|'type'|'balanceCents'>|null,amount:number|null,reverse=false){
 const fail=(error:string)=>({dueBeforeCents:debt.dueCents,dueAfterCents:null,balanceBeforeCents:account?.balanceCents??null,balanceAfterCents:null,error});
 if(debt.status==='cancelled')return fail('İptal edilen borca ödeme kaydedilemez.');
 if(amount===null||!Number.isSafeInteger(amount)||amount<1)return fail('Ödediğin tutarı gir.');
 if(!account)return fail('Paranın çıktığı kasa veya banka hesabını seç.');
 if(!['cash','bank'].includes(account.type)||account.currency!==debt.currency)return fail('Aynı para biriminde bir kasa veya banka hesabı seç.');
 if(!Number.isSafeInteger(debt.dueCents)||!Number.isSafeInteger(account.balanceCents))return fail('Güncel tutarları yeniden yükle.');
 if(!reverse&&amount>debt.dueCents)return fail('Ödeme kalan borcu aşamaz.');
 if(!reverse&&amount>account.balanceCents)return fail('Seçilen hesapta yeterli para yok.');
 const due=BigInt(debt.dueCents)+(reverse?1n:-1n)*BigInt(amount),balance=BigInt(account.balanceCents)+(reverse?1n:-1n)*BigInt(amount),limit=BigInt(Number.MAX_SAFE_INTEGER);
 if(due<0n||due>BigInt(debt.amountCents)||due>limit||balance<0n||balance>limit)return fail('Tutar hesap sınırını aşıyor. Güncel kayıtları kontrol et.');
 return{dueBeforeCents:debt.dueCents,dueAfterCents:Number(due),balanceBeforeCents:account.balanceCents,balanceAfterCents:Number(balance),error:null};
}

export function supplierMoney(cents:number,currency='TRY'):string{if(!Number.isSafeInteger(cents))throw new TypeError('invalid_supplier_amount');const value=BigInt(cents),absolute=value<0n?-value:value,whole=absolute/100n,fraction=String(absolute%100n).padStart(2,'0'),format=new Intl.NumberFormat('tr-TR',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2});return format.formatToParts(value<0n?(whole===0n?-0:-whole):whole).map(part=>part.type==='fraction'?fraction:part.value).join('');}
