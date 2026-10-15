import {accountingCashResultMatches,accountingUuid,parseAccountingCashIntent,parseAccountingCashResult,type AccountingCashAction,type AccountingCashIntentMap,type AccountingCashResult,type AccountingCashSession} from '@celebix/saas-contracts';
export type CashCommand={key:string;currency:string;accountName:string}&({kind:'open';intent:AccountingCashIntentMap['open']}|{kind:'close';intent:AccountingCashIntentMap['close']});
export const cashStorageKey=(scopeKey:string)=>`celebix-accounting-cash:${scopeKey}`;
export function parseStoredCashCommand(value:unknown):CashCommand{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('invalid_cash_command');
 const b=value as Record<string,unknown>,keys=['key','kind','currency','accountName','intent'];if(Object.keys(b).length!==keys.length||keys.some(key=>!Object.hasOwn(b,key))||b.kind!=='open'&&b.kind!=='close'||typeof b.currency!=='string'||!/^[A-Z]{3}$/.test(b.currency)||typeof b.accountName!=='string'||b.accountName.length<1||b.accountName.length>200||b.accountName!==b.accountName.trim())throw new TypeError('invalid_cash_command');
 const common={key:accountingUuid(b.key),currency:b.currency,accountName:b.accountName};
 return b.kind==='open'?{...common,kind:'open',intent:parseAccountingCashIntent('open',b.intent)}:{...common,kind:'close',intent:parseAccountingCashIntent('close',b.intent)};
}
export function bindCashResult(command:CashCommand,value:unknown):AccountingCashResult{
 const result=parseAccountingCashResult(value),s=result.session;
 if(!accountingCashResultMatches(result,command.kind,command.intent,command.key)||s.currency!==command.currency)throw new TypeError('cash_result_mismatch');
 return result;
}
export const cashDifferenceLabel=(difference:number)=>difference===0?'Fark yok':difference<0?'Eksik':'Fazla';
export function cashCountPreview(kind:AccountingCashAction,countedCents:number|null,accountBalanceCents:number,active:AccountingCashSession|null){
 const expectedCents=kind==='close'?active?.expectedCents??null:accountBalanceCents,inheritedDifferenceCents=kind==='close'?active?.openingDifferenceCents??null:null;
 const result=(differenceCents:number|null,totalDifferenceCents:number|null,error:string|null)=>({expectedCents,inheritedDifferenceCents,differenceCents,totalDifferenceCents,noteRequired:differenceCents!==null&&differenceCents!==0,error});
 if(expectedCents===null)return result(null,null,'Açık kasa kaydını yeniden yükle.');
 if(countedCents===null||!Number.isSafeInteger(countedCents)||countedCents<0)return result(null,null,'Saydığın parayı gir. Kasa boşsa 0 yaz.');
 if(!Number.isSafeInteger(expectedCents)||!Number.isSafeInteger(accountBalanceCents))return result(null,null,'Güncel kasa tutarını yeniden yükle.');
 const difference=BigInt(countedCents)-BigInt(expectedCents),total=BigInt(countedCents)-BigInt(accountBalanceCents),limit=BigInt(Number.MAX_SAFE_INTEGER);
 if(difference>limit||difference< -limit||total>limit||total< -limit)return result(null,null,'Sayım farkı hesap sınırını aşıyor. Tutarları kontrol et.');
 return result(Number(difference),Number(total),null);
}

export function cashCountText(cents:number):string{if(!Number.isSafeInteger(cents)||cents<0)throw new TypeError('invalid_cash_count');const amount=BigInt(cents);return`${amount/100n}.${String(amount%100n).padStart(2,'0')}`;}
