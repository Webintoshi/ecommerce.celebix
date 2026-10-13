import {timingSafeEqual} from 'node:crypto';
import {parseOwnerAdminLoginSecurityConfig,type OwnerAdminLoginSecurityConfig} from '../admin-login-security/config.ts';
export type MerchantWhatsAppConfig=OwnerAdminLoginSecurityConfig&Readonly<{phoneLookupKeyId:string;phoneLookupKey:Uint8Array;recipientRateKey:Uint8Array;ingressKey:Uint8Array}>;
function invalid():never{throw new Error('merchant_whatsapp_configuration_invalid');}
export function parseMerchantWhatsAppConfig(source:Record<string,string|undefined>):MerchantWhatsAppConfig|null {
 const enabled=source.CELEBIX_MERCHANT_WHATSAPP_ENABLED;
 if(enabled===undefined||enabled==='false')return null;
 if(enabled!=='true')invalid();
 const base=parseOwnerAdminLoginSecurityConfig(source);if(!base)invalid();
 const phoneLookupKeyId=source.CELEBIX_MERCHANT_PHONE_LOOKUP_KEY_ID??'',lookup=source.CELEBIX_MERCHANT_PHONE_LOOKUP_KEY??'',rate=source.CELEBIX_WHATSAPP_OTP_RATE_KEY??'',ingress=source.CELEBIX_ADMIN_LOGIN_INGRESS_KEY_HEX??'';
 if(!/^[a-z][a-z0-9_-]{2,31}$/u.test(phoneLookupKeyId)||!/^[a-f0-9]{64}$/u.test(lookup)||!/^[a-f0-9]{64}$/u.test(rate)||!/^[a-f0-9]{64}$/u.test(ingress))invalid();
 const phoneLookupKey=Buffer.from(lookup,'hex'),recipientRateKey=Buffer.from(rate,'hex'),ingressKey=Buffer.from(ingress,'hex');
 if(timingSafeEqual(phoneLookupKey,recipientRateKey)||timingSafeEqual(phoneLookupKey,ingressKey)||timingSafeEqual(recipientRateKey,ingressKey)||[...base.masterKeys.values()].some(key=>timingSafeEqual(key,phoneLookupKey)||timingSafeEqual(key,recipientRateKey)||timingSafeEqual(key,ingressKey)))invalid();
 return Object.freeze({...base,phoneLookupKeyId,phoneLookupKey,recipientRateKey,ingressKey});
}
