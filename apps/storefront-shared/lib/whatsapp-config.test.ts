import assert from "node:assert/strict";
import test from "node:test";
import {parseStorefrontWhatsAppConfig} from "./runtime-config.ts";
const env={CELEBIX_STOREFRONT_ACCOUNT_WHATSAPP_MODE:"vatansms_device",CELEBIX_STOREFRONT_ACCOUNT_VATANSMS_API_KEY:"a".repeat(24),CELEBIX_STOREFRONT_ACCOUNT_VATANSMS_REG_ID:"2620466171"};
test("WhatsApp configuration is optional and enables only the actual complete device authority",()=>{
 assert.equal(parseStorefrontWhatsAppConfig({}),null);assert.equal(parseStorefrontWhatsAppConfig(env)?.regId,"2620466171");
 for(const values of [{...env,CELEBIX_STOREFRONT_ACCOUNT_VATANSMS_API_KEY:undefined},{...env,CELEBIX_STOREFRONT_ACCOUNT_VATANSMS_REG_ID:"https://evil.example"},{...env,CELEBIX_STOREFRONT_ACCOUNT_WHATSAPP_MODE:"other"}])assert.throws(()=>parseStorefrontWhatsAppConfig(values));
});
