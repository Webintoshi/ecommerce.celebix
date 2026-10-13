import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMerchantWhatsAppConfig} from './config.ts';
const source={CELEBIX_MERCHANT_WHATSAPP_ENABLED:'true',CELEBIX_ADMIN_LOGIN_SECURITY_ENABLED:'true',CELEBIX_ADMIN_LOGIN_MASTER_KEY_ID:'adm1',CELEBIX_ADMIN_LOGIN_MASTER_KEYRING_JSON:JSON.stringify({adm1:'01'.repeat(32)}),CELEBIX_ADMIN_WHATSAPP_API_KEY:'a'.repeat(24),CELEBIX_ADMIN_WHATSAPP_REG_ID:'123',CELEBIX_ADMIN_LOGIN_WEBHOOK_SECRET:'w'.repeat(32),CELEBIX_MERCHANT_PHONE_LOOKUP_KEY_ID:'phone-v1',CELEBIX_MERCHANT_PHONE_LOOKUP_KEY:'02'.repeat(32),CELEBIX_WHATSAPP_OTP_RATE_KEY:'03'.repeat(32),CELEBIX_ADMIN_LOGIN_INGRESS_KEY_HEX:'04'.repeat(32)};
test('new phone feature is separately gated and validates its stable independent runtime keys',()=>{
 assert.equal(parseMerchantWhatsAppConfig({}),null);assert.equal(parseMerchantWhatsAppConfig({...source,CELEBIX_MERCHANT_WHATSAPP_ENABLED:'false'}),null);
 const c=parseMerchantWhatsAppConfig(source);assert.ok(c);assert.equal(c.phoneLookupKeyId,'phone-v1');assert.equal(c.phoneLookupKey.length,32);assert.equal(c.recipientRateKey.length,32);
});
test('missing reused malformed or disabled foundation configuration cannot enable sends',()=>{
 for(const patch of [{CELEBIX_WHATSAPP_OTP_RATE_KEY:undefined},{CELEBIX_WHATSAPP_OTP_RATE_KEY:'bad'},{CELEBIX_WHATSAPP_OTP_RATE_KEY:'02'.repeat(32)},{CELEBIX_MERCHANT_PHONE_LOOKUP_KEY:'01'.repeat(32)},{CELEBIX_MERCHANT_PHONE_LOOKUP_KEY_ID:'bad.key'},{CELEBIX_MERCHANT_WHATSAPP_ENABLED:'1'},{CELEBIX_ADMIN_LOGIN_SECURITY_ENABLED:'false'}])assert.throws(()=>parseMerchantWhatsAppConfig({...source,...patch}));
});
