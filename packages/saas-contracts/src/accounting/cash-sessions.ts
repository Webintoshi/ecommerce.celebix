import {accountingExact,accountingInteger,accountingUuid} from './validation.ts';
import {parseAccountingAccount} from './response.ts';
import type {AccountingAccount} from './types.ts';

export type AccountingCashAction='open'|'close';
export interface AccountingCashOpenIntent {readonly accountId:string;readonly expectedVersion:number;readonly expectedLastSessionId:string|null;readonly countedCents:number;readonly note:string|null;}
export interface AccountingCashCloseIntent {readonly accountId:string;readonly expectedVersion:number;readonly sessionId:string;readonly countedCents:number;readonly note:string|null;}
export interface AccountingCashIntentMap {open:AccountingCashOpenIntent;close:AccountingCashCloseIntent;}
export interface AccountingCashSession {
 readonly id:string;readonly accountId:string;readonly sequence:number;readonly currency:string;readonly status:'open'|'closed';readonly openedAt:string;readonly openedBy:string;
 readonly openingCountCents:number;readonly openingBalanceCents:number;readonly openingDifferenceCents:number;readonly openingNote:string|null;
 readonly closedAt:string|null;readonly closedBy:string|null;readonly countedCents:number|null;readonly closingNote:string|null;
 readonly balanceCents:number;readonly accountVersion:number;readonly movementCents:number;readonly expectedCents:number;readonly differenceCents:number|null;readonly totalDifferenceCents:number|null;
}
export interface AccountingCashSessions {readonly account:AccountingAccount;readonly active:AccountingCashSession|null;readonly history:readonly AccountingCashSession[];readonly lastSessionId:string|null;readonly hasMore:boolean;}
export interface AccountingCashResult {readonly operationId:string;readonly replayed:boolean;readonly kind:AccountingCashAction;readonly session:AccountingCashSession;}
function fail():never{throw new TypeError('invalid_accounting_cash_session');}
function signed(value:unknown):number{if(!Number.isSafeInteger(value))fail();return value as number;}
function bool(value:unknown):boolean{if(typeof value!=='boolean')fail();return value;}
function text(value:unknown):string{if(typeof value!=='string'||value.length<1||value.length>2000||value!==value.trim()||/[\u0000-\u001f\u007f]/.test(value))fail();return value;}
function timestamp(value:unknown):string{const s=text(value);if(s.length!==24||!Number.isFinite(Date.parse(s))||new Date(s).toISOString()!==s)fail();return s;}
function nullable<T>(value:unknown,parse:(v:unknown)=>T):T|null{return value===null?null:parse(value);}
function exactNumber(value:bigint):number{if(value>BigInt(Number.MAX_SAFE_INTEGER)||value< -BigInt(Number.MAX_SAFE_INTEGER))fail();return Number(value);}
export function parseAccountingCashIntent<K extends AccountingCashAction>(kind:K,value:unknown):AccountingCashIntentMap[K]{
 if(kind!=='open'&&kind!=='close')fail();const b=accountingExact(value,['accountId','expectedVersion',kind==='open'?'expectedLastSessionId':'sessionId','countedCents','note']);
 const common={accountId:accountingUuid(b.accountId),expectedVersion:accountingInteger(b.expectedVersion,1),countedCents:accountingInteger(b.countedCents),note:nullable(b.note,text)};
 return Object.freeze(kind==='open'?{...common,expectedLastSessionId:nullable(b.expectedLastSessionId,accountingUuid)}:{...common,sessionId:accountingUuid(b.sessionId)}) as AccountingCashIntentMap[K];
}
export function parseAccountingCashSession(value:unknown):AccountingCashSession{
 const b=accountingExact(value,['id','accountId','sequence','currency','status','openedAt','openedBy','openingCountCents','openingBalanceCents','openingDifferenceCents','openingNote','closedAt','closedBy','countedCents','closingNote','balanceCents','accountVersion','movementCents','expectedCents','differenceCents','totalDifferenceCents']);
 if(!['open','closed'].includes(b.status as string)||typeof b.currency!=='string'||! /^[A-Z]{3}$/.test(b.currency))fail();
 const v:AccountingCashSession={id:accountingUuid(b.id),accountId:accountingUuid(b.accountId),sequence:accountingInteger(b.sequence,1),currency:b.currency,status:b.status as 'open'|'closed',openedAt:timestamp(b.openedAt),openedBy:accountingUuid(b.openedBy),openingCountCents:accountingInteger(b.openingCountCents),openingBalanceCents:accountingInteger(b.openingBalanceCents),openingDifferenceCents:signed(b.openingDifferenceCents),openingNote:nullable(b.openingNote,text),closedAt:nullable(b.closedAt,timestamp),closedBy:nullable(b.closedBy,accountingUuid),countedCents:nullable(b.countedCents,accountingInteger),closingNote:nullable(b.closingNote,text),balanceCents:accountingInteger(b.balanceCents),accountVersion:accountingInteger(b.accountVersion,1),movementCents:signed(b.movementCents),expectedCents:signed(b.expectedCents),differenceCents:nullable(b.differenceCents,signed),totalDifferenceCents:nullable(b.totalDifferenceCents,signed)};
 const opening=BigInt(v.openingCountCents),original=BigInt(v.openingBalanceCents),balance=BigInt(v.balanceCents);
 if(v.openingDifferenceCents!==exactNumber(opening-original)||v.movementCents!==exactNumber(balance-original)||v.expectedCents!==exactNumber(opening+balance-original)||v.openingDifferenceCents!==0&&v.openingNote===null)fail();
 if(v.status==='open'){if([v.closedAt,v.closedBy,v.countedCents,v.closingNote,v.differenceCents,v.totalDifferenceCents].some(x=>x!==null))fail();}
 else{if(v.closedAt===null||v.closedBy===null||v.countedCents===null||v.differenceCents===null||v.totalDifferenceCents===null||v.closedAt<v.openedAt)fail();const counted=BigInt(v.countedCents);if(v.differenceCents!==exactNumber(counted-BigInt(v.expectedCents))||v.totalDifferenceCents!==exactNumber(counted-balance)||v.differenceCents!==0&&v.closingNote===null)fail();}
 return Object.freeze(v);
}
export function parseAccountingCashSessions(value:unknown):AccountingCashSessions{
 const b=accountingExact(value,['account','active','history','lastSessionId','hasMore']);const account=parseAccountingAccount(b.account);if(account.type!=='cash'||!Array.isArray(b.history)||b.history.length>100)fail();
 const active=nullable(b.active,parseAccountingCashSession),history=b.history.map(parseAccountingCashSession),lastSessionId=nullable(b.lastSessionId,accountingUuid);
 if(active&&(active.status!=='open'||active.balanceCents!==account.balanceCents||active.accountVersion!==account.version))fail();
 for(const row of [...(active?[active]:[]),...history])if(row.accountId!==account.id||row.currency!==account.currency)fail();
 if(history.some((row,i)=>row.status!=='closed'||i>0&&row.sequence>=history[i-1]!.sequence)||active&&history[0]&&active.sequence<=history[0].sequence||lastSessionId!==(active?.id??history[0]?.id??null))fail();
 return Object.freeze({account,active,history:Object.freeze(history),lastSessionId,hasMore:bool(b.hasMore)});
}
export function parseAccountingCashResult(value:unknown):AccountingCashResult{
 const b=accountingExact(value,['operationId','replayed','kind','session']);if(b.kind!=='open'&&b.kind!=='close')fail();const session=parseAccountingCashSession(b.session);if(session.status!==(b.kind==='open'?'open':'closed'))fail();
 return Object.freeze({operationId:accountingUuid(b.operationId),replayed:bool(b.replayed),kind:b.kind,session});
}
/** Bind both an immediate response and a frozen recovery receipt to the original command. */
export function accountingCashResultMatches(result:AccountingCashResult,kind:AccountingCashAction,intent:AccountingCashIntentMap[AccountingCashAction],operationId:string):boolean{
 const session=result.session;if(result.operationId!==operationId||result.kind!==kind||session.accountId!==intent.accountId||session.accountVersion!==intent.expectedVersion)return false;
 if(kind==='open'){const input=intent as AccountingCashOpenIntent;return session.status==='open'&&session.id===operationId&&session.openingCountCents===input.countedCents&&session.openingNote===input.note&&session.movementCents===0&&session.balanceCents===session.openingBalanceCents&&session.id!==input.expectedLastSessionId;}
 const input=intent as AccountingCashCloseIntent;return session.status==='closed'&&session.id===input.sessionId&&session.countedCents===input.countedCents&&session.closingNote===input.note;
}
