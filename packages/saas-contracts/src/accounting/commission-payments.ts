import {accountingExact,accountingInteger,accountingUuid} from './validation.ts';
import {parseAccountingAccount} from './response.ts';
import type {AccountingAccount} from './types.ts';

export const ACCOUNTING_COMMISSION_PAYMENT_ACTIONS=['pay','reversePayment'] as const;
export type AccountingCommissionPaymentAction=typeof ACCOUNTING_COMMISSION_PAYMENT_ACTIONS[number];
export interface AccountingCommissionPayIntent {readonly membershipId:string;readonly accountId:string;readonly amountCents:number;readonly currency:'TRY';readonly occurredOn:string;readonly note:string;readonly expectedBalanceToken:string;readonly expectedAccountVersion:number;}
export interface AccountingCommissionReversePaymentIntent {readonly membershipId:string;readonly paymentId:string;readonly reason:string;readonly expectedBalanceToken:string;readonly expectedAccountVersion:number;}
export interface AccountingCommissionPaymentIntentMap {pay:AccountingCommissionPayIntent;reversePayment:AccountingCommissionReversePaymentIntent;}
export interface AccountingCommissionBalanceTotals {readonly earnedCommissionCents:number;readonly paidCents:number;readonly dueCents:number;readonly overpaidCents:number;}
export interface AccountingCommissionBalance extends AccountingCommissionBalanceTotals {readonly membershipId:string;readonly displayName:string;readonly phoneMasked:string|null;readonly currency:'TRY';readonly balanceToken:string;}
export interface AccountingCommissionBalances {readonly rows:readonly AccountingCommissionBalance[];readonly totals:AccountingCommissionBalanceTotals;}
export interface AccountingCommissionPayment {readonly id:string;readonly membershipId:string;readonly eventId:string;readonly accountId:string;readonly accountName:string;readonly accountType:'cash'|'bank';readonly currency:'TRY';readonly amountCents:number;readonly occurredOn:string;readonly createdAt:string;readonly note:string;readonly reversed:boolean;readonly reversalReason:string|null;}
export interface AccountingCommissionPaymentDetail {readonly balance:AccountingCommissionBalance;readonly payments:readonly AccountingCommissionPayment[];readonly hasMore:boolean;readonly today:string;}
export interface AccountingCommissionPaymentResult {readonly operationId:string;readonly replayed:boolean;readonly kind:AccountingCommissionPaymentAction;readonly balance:AccountingCommissionBalance;readonly payment:AccountingCommissionPayment;readonly account:AccountingAccount;readonly previousDueCents:number;readonly previousOverpaidCents:number;readonly previousBalanceCents:number;readonly previousBalanceToken:string;}
const MONEY=['earnedCommissionCents','paidCents','dueCents','overpaidCents'] as const;
function fail():never{throw new TypeError('invalid_accounting_commission_payment');}
function text(value:unknown,max=2000):string{if(typeof value!=='string'||value.length<1||value.length>max||value!==value.trim()||/[\u0000-\u001f\u007f]/.test(value))fail();return value;}
function token(value:unknown):string{if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail();return value;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')fail();return value;}
function currency(value:unknown):'TRY'{if(value!=='TRY')fail();return value;}
function date(value:unknown):string{const v=text(value,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'0001-01-01'||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail();return v;}
function timestamp(value:unknown):string{const v=text(value,24);if(v.length!==24||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)fail();return v;}
function action(value:unknown):AccountingCommissionPaymentAction{if(!(ACCOUNTING_COMMISSION_PAYMENT_ACTIONS as readonly unknown[]).includes(value))fail();return value as AccountingCommissionPaymentAction;}
function array<T>(value:unknown,max:number,parse:(value:unknown)=>T):readonly T[]{if(!Array.isArray(value)||value.length>max)fail();const descriptors=Object.getOwnPropertyDescriptors(value);if(Reflect.ownKeys(descriptors).length!==value.length+1)fail();const result:T[]=[];for(let i=0;i<value.length;i++){const d=descriptors[String(i)];if(!d||!('value'in d)||!d.enumerable)fail();result.push(parse(d.value));}return Object.freeze(result);}
function totals(value:unknown):AccountingCommissionBalanceTotals{const b=accountingExact(value,MONEY);for(const key of MONEY)accountingInteger(b[key]);if(BigInt(b.earnedCommissionCents as number)-BigInt(b.paidCents as number)!==BigInt(b.dueCents as number)-BigInt(b.overpaidCents as number))fail();return Object.freeze(b) as unknown as AccountingCommissionBalanceTotals;}
export function parseAccountingCommissionPaymentIntent<K extends AccountingCommissionPaymentAction>(kind:K,value:unknown):AccountingCommissionPaymentIntentMap[K]{
 action(kind);const b=accountingExact(value,kind==='pay'?['membershipId','accountId','amountCents','currency','occurredOn','note','expectedBalanceToken','expectedAccountVersion']:['membershipId','paymentId','reason','expectedBalanceToken','expectedAccountVersion']);
 const common={membershipId:accountingUuid(b.membershipId),expectedBalanceToken:token(b.expectedBalanceToken),expectedAccountVersion:accountingInteger(b.expectedAccountVersion,1)};
 return Object.freeze(kind==='pay'?{...common,accountId:accountingUuid(b.accountId),amountCents:accountingInteger(b.amountCents,1),currency:currency(b.currency),occurredOn:date(b.occurredOn),note:text(b.note)}:{...common,paymentId:accountingUuid(b.paymentId),reason:text(b.reason)}) as unknown as AccountingCommissionPaymentIntentMap[K];
}
export function parseAccountingCommissionBalance(value:unknown):AccountingCommissionBalance{
 const b=accountingExact(value,['membershipId','displayName','phoneMasked','currency','balanceToken',...MONEY]);const money=totals(Object.fromEntries(MONEY.map(k=>[k,b[k]])));
 if(money.dueCents>0&&money.overpaidCents>0)fail();
 return Object.freeze({...money,membershipId:accountingUuid(b.membershipId),displayName:text(b.displayName,320),phoneMasked:b.phoneMasked===null?null:text(b.phoneMasked,80),currency:currency(b.currency),balanceToken:token(b.balanceToken)});
}
export function parseAccountingCommissionBalances(value:unknown):AccountingCommissionBalances{
 const b=accountingExact(value,['rows','totals']),rows=array(b.rows,1000,parseAccountingCommissionBalance),sum=totals(b.totals);if(new Set(rows.map(row=>row.membershipId)).size!==rows.length)fail();
 for(const key of MONEY)if(rows.reduce((n,row)=>n+BigInt(row[key]),0n)!==BigInt(sum[key]))fail();return Object.freeze({rows,totals:sum});
}
export function parseAccountingCommissionPayment(value:unknown):AccountingCommissionPayment{
 const b=accountingExact(value,['id','membershipId','eventId','accountId','accountName','accountType','currency','amountCents','occurredOn','createdAt','note','reversed','reversalReason']);if(!['cash','bank'].includes(b.accountType as string))fail();const reversed=bool(b.reversed),reversalReason=b.reversalReason===null?null:text(b.reversalReason);if(reversed!==(reversalReason!==null))fail();
 return Object.freeze({id:accountingUuid(b.id),membershipId:accountingUuid(b.membershipId),eventId:accountingUuid(b.eventId),accountId:accountingUuid(b.accountId),accountName:text(b.accountName,200),accountType:b.accountType as 'cash'|'bank',currency:currency(b.currency),amountCents:accountingInteger(b.amountCents,1),occurredOn:date(b.occurredOn),createdAt:timestamp(b.createdAt),note:text(b.note),reversed,reversalReason});
}
export function parseAccountingCommissionPaymentDetail(value:unknown):AccountingCommissionPaymentDetail{
 const b=accountingExact(value,['balance','payments','hasMore','today']),balance=parseAccountingCommissionBalance(b.balance),payments=array(b.payments,100,parseAccountingCommissionPayment),hasMore=bool(b.hasMore),today=date(b.today);
 if(new Set(payments.map(p=>p.id)).size!==payments.length||new Set(payments.map(p=>p.eventId)).size!==payments.length||hasMore&&payments.length!==100||payments.some(p=>p.membershipId!==balance.membershipId))fail();
 if(!hasMore&&payments.reduce((n,p)=>n+(p.reversed?0n:BigInt(p.amountCents)),0n)!==BigInt(balance.paidCents))fail();return Object.freeze({balance,payments,hasMore,today});
}
export function parseAccountingCommissionPaymentResult(value:unknown):AccountingCommissionPaymentResult{
 const b=accountingExact(value,['operationId','replayed','kind','balance','payment','account','previousDueCents','previousOverpaidCents','previousBalanceCents','previousBalanceToken']);
 const v:AccountingCommissionPaymentResult={operationId:accountingUuid(b.operationId),replayed:bool(b.replayed),kind:action(b.kind),balance:parseAccountingCommissionBalance(b.balance),payment:parseAccountingCommissionPayment(b.payment),account:parseAccountingAccount(b.account),previousDueCents:accountingInteger(b.previousDueCents),previousOverpaidCents:accountingInteger(b.previousOverpaidCents),previousBalanceCents:accountingInteger(b.previousBalanceCents),previousBalanceToken:token(b.previousBalanceToken)};
 const p=v.payment,a=v.account,balance=v.balance;if(p.membershipId!==balance.membershipId||p.accountId!==a.id||p.accountName!==a.name||p.accountType!==a.type||p.currency!==a.currency||a.currency!=='TRY'||a.version<2||v.previousDueCents>0&&v.previousOverpaidCents>0||v.previousBalanceToken===balance.balanceToken)fail();
 const after=BigInt(balance.dueCents)-BigInt(balance.overpaidCents),before=BigInt(v.previousDueCents)-BigInt(v.previousOverpaidCents),amount=BigInt(p.amountCents);
 if(v.kind==='pay'){if(p.reversed||p.id!==v.operationId||v.previousOverpaidCents!==0||after!==before-amount||balance.overpaidCents!==0||balance.paidCents<p.amountCents||BigInt(a.balanceCents)+amount!==BigInt(v.previousBalanceCents))fail();}
 else if(!p.reversed||after!==before+amount||BigInt(v.previousBalanceCents)+amount!==BigInt(a.balanceCents))fail();return Object.freeze(v);
}
export function accountingCommissionPaymentResultMatches(result:AccountingCommissionPaymentResult,kind:AccountingCommissionPaymentAction,intent:AccountingCommissionPaymentIntentMap[AccountingCommissionPaymentAction],operationId:string):boolean{
 if(result.operationId!==operationId||result.kind!==kind||result.balance.membershipId!==intent.membershipId||result.previousBalanceToken!==intent.expectedBalanceToken||BigInt(result.account.version)!==BigInt(intent.expectedAccountVersion)+1n)return false;
 const p=result.payment;if(kind==='reversePayment'){const i=intent as AccountingCommissionReversePaymentIntent;return p.id===i.paymentId&&p.reversed&&p.reversalReason===i.reason;}
 const i=intent as AccountingCommissionPayIntent;return p.id===operationId&&p.accountId===i.accountId&&p.amountCents===i.amountCents&&p.currency===i.currency&&p.occurredOn===i.occurredOn&&p.note===i.note&&!p.reversed;
}
