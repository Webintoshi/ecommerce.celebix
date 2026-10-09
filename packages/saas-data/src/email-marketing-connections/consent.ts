import {emailMarketingInteger,emailMarketingText,emailMarketingUuid,parseEmailMarketingProvider,type EmailMarketingProvider} from '@celebix/saas-contracts';
import {EmailMarketingError} from './errors.ts';
export interface EmailMarketingConsentEvent {readonly storeId:string;readonly email:string;readonly sequence:number;readonly kind:'grant'|'deny'|'archive'|'address_changed';readonly source:'newsletter'|'customer'|'cart_capture'|'provider';readonly sourceId:string;readonly sourceVersion:string;readonly recordedAt:string;readonly consentedAt:string|null;readonly evidenceVersion:string|null}
export interface EmailMarketingConsentDecision {readonly kind:'eligible'|'denied'|'missing_evidence'|'needs_renewal'|'archived';readonly email:string|null;readonly consentVersion:number;readonly consentedAt:string|null;readonly source:EmailMarketingConsentEvent['source']|null}
function time(value:unknown):number {if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new EmailMarketingError('invalid_input');return Date.parse(value);}
export function resolveEmailMarketingConsent(events:readonly EmailMarketingConsentEvent[],now:Date,provider:EmailMarketingProvider):EmailMarketingConsentDecision {
 parseEmailMarketingProvider(provider);if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!Array.isArray(events))throw new EmailMarketingError('invalid_input');
 let selected:EmailMarketingConsentEvent|undefined;let selectedTime=-Infinity;let store:string|undefined,email:string|undefined;
 for(const event of events){const sid=emailMarketingUuid(event.storeId),address=emailMarketingText(event.email,254);if(address!==address.trim().toLowerCase()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||store!==undefined&&store!==sid||email!==undefined&&email!==address)throw new EmailMarketingError('invalid_input');store=sid;email=address;emailMarketingInteger(event.sequence,1);emailMarketingText(event.sourceId,1024);emailMarketingText(event.sourceVersion,128);
  if(!['grant','deny','archive','address_changed'].includes(event.kind)||!['newsletter','customer','cart_capture','provider'].includes(event.source))throw new EmailMarketingError('invalid_input');const recorded=time(event.recordedAt);let effective=recorded;
  if(event.kind==='grant'){if(!event.evidenceVersion||event.consentedAt===null)throw new EmailMarketingError('invalid_input');emailMarketingText(event.evidenceVersion,1024);effective=time(event.consentedAt);if(effective>recorded||effective>now.getTime())throw new EmailMarketingError('invalid_input');}
  // Original grant time, not its later import time, determines precedence.
  const priority=(kind:EmailMarketingConsentEvent['kind'])=>kind==='deny'?2:kind==='grant'?0:1;
  if(effective>selectedTime||effective===selectedTime&&selected!==undefined&&(priority(event.kind)>priority(selected.kind)||priority(event.kind)===priority(selected.kind)&&event.sequence>selected.sequence)){selected=event;selectedTime=effective;}
 }
 if(!selected)return Object.freeze({kind:'missing_evidence',email:null,consentVersion:0,consentedAt:null,source:null});
 const renewal=new Date(now);renewal.setUTCFullYear(renewal.getUTCFullYear()-2);
 const kind=selected.kind==='deny'?'denied':selected.kind!=='grant'?'archived':provider==='brevo'&&selectedTime<renewal.getTime()?'needs_renewal':'eligible';
 return Object.freeze({kind,email:selected.email,consentVersion:selected.sequence,consentedAt:selected.kind==='grant'?selected.consentedAt:null,source:selected.source});
}
