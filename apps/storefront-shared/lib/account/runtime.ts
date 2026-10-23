import { createHash,createHmac } from "node:crypto";

import type {
  StorefrontAccountAddress,
  StorefrontAccountMutationResult,
  StorefrontAccountOrder,
} from "@celebix/saas-contracts";
import {StorefrontIdentityRepositoryError,type StorefrontIdentityRepository,type StorefrontIdentitySessionResult} from "@celebix/saas-data";

import {
  accountCredentialDigestCandidates,
  accountCsrfDigest,
  accountUserAgentDigest,
  createAccountSessionCredential,
  readAccountCookie,
  serializeAccountChallengeCookieDeletion,
  serializeAccountCookie,
  serializeAccountCookieDeletion,
  type StorefrontIdentityKeyring,
} from "./credential.ts";
import { normalizeStorefrontAccountPhone } from "./phone.ts";
import { openPhoneChallenge, phoneCodeDigest, phoneRecipientDigest, phoneRequestDigest, sealPhoneChallenge, serializePhoneChallengeCookie,phoneOperationBytes,phoneOperationUuid,phoneBudgetDigest,sealPhoneCompletion,openPhoneCompletion } from "./phone-credential.ts";
import type { WhatsAppOtpDelivery } from "./whatsapp-delivery.ts";
import type { BindStorefrontCartIdentity } from "../cart-identity/runtime.ts";

const CODE = /^[0-9]{6}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CSRF_COOKIE = "__Host-celebix_account_csrf";

export type StorefrontIdentityRuntimeDependencies = Readonly<{
  repository: StorefrontIdentityRepository;
  hmacKeyring: StorefrontIdentityKeyring;
  sealKeyring: StorefrontIdentityKeyring;
  now: () => Date;
  randomBytes: (size: number) => Uint8Array;
  randomUuid: () => string;
  randomLoginCode: () => string;
  deliverLoginCode: (message: Readonly<{ email: string; ticket: string; code: string; storeName: string; storeOrigin: string; returnTo: string; idempotencyKey: string }>) => Promise<void>;
  emailDeliveryDispositionSupported?: boolean;
  whatsappRateKey?:Uint8Array;
  deliverWhatsAppCode?: WhatsAppOtpDelivery;
  bindCartIdentity?: BindStorefrontCartIdentity;
}>;

type CookieAuthority = Readonly<{ hostname: string; cookieHeader: string | null }>;
type OperationAuthority = CookieAuthority & Readonly<{ operationId: string }>;
type MutationResponse = Readonly<{ result: StorefrontAccountMutationResult }>;

export interface StorefrontIdentityRuntime {
  readonly whatsappEnabled?: boolean;
  start(input: Readonly<{ hostname: string; email: string; requestAuthority: string; returnTo: string; brand: Readonly<{ storeName: string; logoUrl: string | null; primaryColor: string | null }> }>): Promise<Readonly<{ result: Readonly<{ outcome: "accepted"; retryAfterSeconds: number; deliveryRequired?:boolean }>; setCookie: string }>>;
  startPhone?(input: Readonly<{ hostname:string;phone:string;operationId:string;trustedIp?:string|null;firstName?:string;lastName?:string;bindPhone?:true;cookieHeader?:string|null;requestAuthority:string;returnTo:string;brand:Readonly<{storeName:string;logoUrl:string|null;primaryColor:string|null}> }>):Promise<Readonly<{result:Readonly<{outcome:"accepted";retryAfterSeconds:number;deliveryRequired:boolean}>;setCookie:string}>>;
  verify(input: Readonly<{ hostname: string; deviceLabel: string; userAgent: string;operationId?:string }> & Readonly<{ ticket: string } | { challengeCookie: string | null; code: string }>): Promise<Readonly<{ result: Readonly<{ outcome: "authenticated"; profileRequired: false } | { outcome: "profile_required"; profileRequired: true }>; setCookies: readonly string[] }>>;
  completeProfile(input: OperationAuthority & Readonly<{ firstName: string; lastName: string; phone?: string; deviceLabel: string; userAgent: string }>): Promise<Readonly<{ result: StorefrontAccountMutationResult; setCookies: readonly string[] }>>;
  session(hostname: string, cookieHeader: string | null): Promise<StorefrontIdentitySessionResult & Readonly<{ setCookie?: string }>>;
  logout(hostname: string, cookieHeader: string | null): Promise<Readonly<{ setCookies: readonly string[] }>>;
  logoutAll(input: CookieAuthority): Promise<Readonly<{ revoked: number; setCookies: readonly string[] }>>;
  updateProfile(input: OperationAuthority & Readonly<{ firstName: string; lastName: string; phone?: string; expectedVersion: number }>): Promise<MutationResponse>;
  saveAddress(input: OperationAuthority & Readonly<{ address: StorefrontAccountAddress; expectedVersion: number }>): Promise<MutationResponse>;
  deleteAddress(input: OperationAuthority & Readonly<{ addressId: string; expectedVersion: number }>): Promise<MutationResponse>;
  favorite(input: OperationAuthority & Readonly<{ productId: string; enabled: boolean }>): Promise<MutationResponse>;
  orders(input: CookieAuthority & Readonly<{ limit: number }>): Promise<readonly StorefrontAccountOrder[]>;
  order(input: CookieAuthority & Readonly<{ orderReference: string }>): Promise<StorefrontAccountOrder>;
  devices(input: CookieAuthority): ReturnType<StorefrontIdentityRepository["devices"]>;
  revokeDevice(input: OperationAuthority & Readonly<{ deviceId: string }>): Promise<MutationResponse>;
}

function invalid(): never { throw new TypeError("storefront_identity_runtime_invalid"); }
function nowValue(source: () => Date): Date { const value = source(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(); return new Date(value.getTime()); }
function uuid(source: () => string): string { const value = source(); if (!UUID.test(value)) invalid(); return value; }
function correlation(kind: string, id: string): string { return `${kind}_${id.replaceAll("-", "")}`.slice(0, 80); }
function fingerprint(kind: string, value: unknown): string { return createHash("sha256").update(JSON.stringify([`storefront-identity/${kind}/v1`, value]), "utf8").digest("hex"); }
function csrfValue(random: (size: number) => Uint8Array): string {
  const selected = random(32); if (!(selected instanceof Uint8Array) || selected.byteLength !== 32) invalid();
  const bytes = Buffer.from(selected); try { return bytes.toString("base64url"); } finally { bytes.fill(0); }
}
function serializeCsrf(value: string): string { if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) invalid(); return `${CSRF_COOKIE}=${value}; Path=/; Max-Age=2592000; Secure; SameSite=Strict`; }
function deleteCsrf(): string { return `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Strict`; }
function challengeValue(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("ch1.") || value.startsWith("ph1.")) return value;
  let found:string|null=null;
  for (const segment of value.split(";")) {
    const selected = segment.trim();
    if (selected.startsWith("__Host-celebix_account_challenge=")) {if(found!==null)return null;found=selected.slice("__Host-celebix_account_challenge=".length);}
  }
  return found;
}

export function createStorefrontIdentityRuntime(dependencies: StorefrontIdentityRuntimeDependencies): StorefrontIdentityRuntime {
  const { repository, hmacKeyring, sealKeyring, now, randomBytes, randomUuid } = dependencies;
  if (!repository) invalid();

  function credentials(cookieHeader: string | null) {
    const cookie = readAccountCookie(cookieHeader);
    if (cookie.kind !== "present") return Object.freeze([]);
    return accountCredentialDigestCandidates(cookie.value, hmacKeyring);
  }
  function requiredCredentials(cookieHeader: string | null) {
    const selected = credentials(cookieHeader); if (selected.length === 0) invalid(); return selected;
  }
  function operationBase(input: OperationAuthority, payload: unknown, kind: string) {
    const current = nowValue(now);
    return Object.freeze({ hostname: input.hostname, now: current, candidates: requiredCredentials(input.cookieHeader), operationId: input.operationId, fingerprint: fingerprint(kind, payload), correlationId: correlation(kind, input.operationId) });
  }

  const runtime: StorefrontIdentityRuntime = {
    whatsappEnabled: typeof dependencies.deliverWhatsAppCode === "function" && typeof repository.phoneCommand === "function" && dependencies.whatsappRateKey instanceof Uint8Array && dependencies.whatsappRateKey.length===32,
    async start(_input) { throw new Error("storefront_email_login_retired"); },
    async startPhone(input) {
      if(!runtime.whatsappEnabled||!repository.phoneCommand||!dependencies.deliverWhatsAppCode||!dependencies.whatsappRateKey)throw new Error('storefront_whatsapp_unavailable');
      const phone=normalizeStorefrontAccountPhone(input.phone),operationId=input.operationId;if(!UUID.test(operationId)||(input.firstName===undefined)!==(input.lastName===undefined))invalid();
      const current=nowValue(now),challengeId=operationId,expiresAt=new Date(current.getTime()+600000);
      const candidates=input.bindPhone?requiredCredentials(input.cookieHeader??null):undefined;
      if(input.bindPhone){const account=await runtime.session(input.hostname,input.cookieHeader??null);if(account.outcome!=='found'||account.snapshot.profile.phone!==phone||account.snapshot.profile.phoneVerified===true)invalid();}
      let code='';for(let counter=0;counter<128;counter++){const bytes=phoneOperationBytes(`code/${counter}`,input.hostname,challengeId,operationId,hmacKeyring);const number=bytes.readUInt32BE();bytes.fill(0);if(number<4294000000){code=String(number%1000000).padStart(6,'0');break;}}if(!code)invalid();
      const sealed=sealPhoneChallenge({challengeId,hostname:input.hostname,phone,...(input.firstName!==undefined?{firstName:input.firstName,lastName:input.lastName!}:{}),...(input.bindPhone?{bindAccount:true as const}:{}),expiresAt:expiresAt.toISOString(),hmacKeyId:hmacKeyring.activeKeyId},sealKeyring,randomBytes);
      const key=hmacKeyring.keys.find(k=>k.keyId===hmacKeyring.activeKeyId);if(!key)invalid();
      const start={operationId,hostname:input.hostname,phoneDigest:phoneRecipientDigest(phone,hmacKeyring).digest,requestDigest:phoneRequestDigest(input.trustedIp??'authenticated_unknown_ip',hmacKeyring).digest,recipientBudgetDigest:phoneBudgetDigest('recipient',phone,dependencies.whatsappRateKey),...(input.trustedIp?{ipBudgetDigest:phoneBudgetDigest('ip',input.trustedIp,dependencies.whatsappRateKey)}:{}),inputFingerprint:createHmac('sha256',key.key).update(JSON.stringify(['celebix/storefront-phone-start/v1',input.hostname,phone,input.firstName??null,input.lastName??null,candidates??null])).digest('hex'),codeKeyId:hmacKeyring.activeKeyId,codeDigest:phoneCodeDigest({hostname:input.hostname,phone,challengeId,code},hmacKeyring).digest,challengeCookie:sealed,...(candidates?{bindingCredentials:candidates}:{})};
      const begun=await repository.phoneCommand('start',start);
      if(begun.outcome==='rate_limited')return {result:{outcome:'accepted',retryAfterSeconds:Number(begun.result?.retryAfterSeconds??60),deliveryRequired:false},setCookie:''};
      if(begun.outcome==='accepted'&&typeof begun.result?.challengeCookie==='string'){const recovered=openPhoneChallenge(begun.result.challengeCookie,sealKeyring);if(!recovered||recovered.hostname!==input.hostname||recovered.phone!==phone||Date.parse(recovered.expiresAt)<=current.getTime())invalid();return {result:{outcome:'accepted',retryAfterSeconds:60,deliveryRequired:true},setCookie:serializePhoneChallengeCookie(begun.result.challengeCookie)};}
      if(begun.outcome!=='prepared')throw new Error('storefront_whatsapp_delivery_uncertain');
      const deliveryBinding={hostname:input.hostname,challengeId,phoneDigest:start.phoneDigest};
      try{await dependencies.deliverWhatsAppCode({phone,code,storeName:input.brand.storeName,idempotencyKey:operationId});}
      catch{await repository.phoneCommand('finish_delivery',{...deliveryBinding,status:'ambiguous'}).catch(()=>undefined);throw new Error('storefront_whatsapp_delivery_uncertain');}
      let finished;try{finished=await repository.phoneCommand('finish_delivery',{...deliveryBinding,status:'accepted'});}catch{finished=await repository.phoneCommand('start',start).catch(()=>null);}
      if(finished?.outcome!=='accepted')throw new Error('storefront_whatsapp_delivery_uncertain');
      return {result:{outcome:'accepted',retryAfterSeconds:60,deliveryRequired:true},setCookie:serializePhoneChallengeCookie(typeof finished.result?.challengeCookie==='string'?finished.result.challengeCookie:sealed)};
    },
    async verify(input) {
      const current=nowValue(now),phoneRaw='ticket' in input?null:challengeValue(input.challengeCookie),operationId=input.operationId;
      if(!phoneRaw?.startsWith('ph1.')||!operationId||!UUID.test(operationId)||'ticket' in input||!CODE.test(input.code)||!repository.phoneCommand)invalid();
      const challenge=openPhoneChallenge(phoneRaw,sealKeyring);if(!challenge||challenge.hostname!==input.hostname||Date.parse(challenge.expiresAt)<=current.getTime())invalid();
      const sessionId=phoneOperationUuid('session',input.hostname,challenge.challengeId,operationId,hmacKeyring,challenge.hmacKeyId),bytes=phoneOperationBytes('credential',input.hostname,challenge.challengeId,operationId,hmacKeyring,challenge.hmacKeyId);
      const credential=createAccountSessionCredential({...hmacKeyring,activeKeyId:challenge.hmacKeyId},()=>bytes);bytes.fill(0);const csrfBytes=phoneOperationBytes('csrf',input.hostname,challenge.challengeId,operationId,hmacKeyring,challenge.hmacKeyId),csrf=csrfBytes.toString('base64url');csrfBytes.fill(0);
      const cookies=[serializeAccountCookie(credential.value),serializeCsrf(csrf),serializeAccountChallengeCookieDeletion()];
      const base={hostname:input.hostname,operationId,challengeId:challenge.challengeId,phoneDigest:phoneRecipientDigest(challenge.phone,hmacKeyring,challenge.hmacKeyId).digest,codeDigest:phoneCodeDigest({hostname:input.hostname,phone:challenge.phone,challengeId:challenge.challengeId,code:input.code},hmacKeyring,challenge.hmacKeyId).digest,phone:challenge.phone,...(challenge.firstName!==undefined?{firstName:challenge.firstName,lastName:challenge.lastName!}:{}),...(challenge.bindAccount?{candidates:requiredCredentials(input.challengeCookie)}:{}),customerId:phoneOperationUuid('customer',input.hostname,challenge.challengeId,operationId,hmacKeyring,challenge.hmacKeyId),accountId:phoneOperationUuid('account',input.hostname,challenge.challengeId,operationId,hmacKeyring,challenge.hmacKeyId),sessionId,sessionKeyId:credential.keyId,sessionDigest:credential.digest,csrfDigest:accountCsrfDigest(sessionId,csrf,hmacKeyring,challenge.hmacKeyId).digest,deviceLabel:input.deviceLabel,userAgentDigest:accountUserAgentDigest(input.hostname,input.userAgent,hmacKeyring,challenge.hmacKeyId).digest,correlationId:correlation('phone_verify',sessionId)};
      // The repository commits OTP rejection counters. It never repeats a
      // send or an uncertain verify; recovery reads the exact encrypted result.
      const completionCiphertext=sealPhoneCompletion({profileRequired:challenge.firstName===undefined,setCookies:cookies},input.hostname,challenge.challengeId,operationId,sealKeyring,randomBytes);
      const verification={...base,completionCiphertext};let verified;
      try{verified=await repository.phoneCommand('verify',verification);}catch{verified=await repository.phoneCommand('read_completion',verification).catch(()=>null);}
      if(!verified||!['authenticated','profile_required','completed'].includes(verified.outcome)||typeof verified.result?.completionCiphertext!=='string')throw new StorefrontIdentityRepositoryError(verified?.outcome==='identity_conflict'?'identity_conflict':'challenge_invalid');
      const recovered=openPhoneCompletion(verified.result.completionCiphertext,input.hostname,challenge.challengeId,operationId,sealKeyring);if(!recovered)invalid();
      const profileRequired=verified.result.profileRequired===true;
      if(!profileRequired){try{await dependencies.bindCartIdentity?.({hostname:input.hostname,cookieHeader:input.challengeCookie,accountCookieHeader:recovered.setCookies.join('; ')});}catch{/* Identity enrichment must not undo a committed login. */}}
      return {result:profileRequired?{outcome:'profile_required',profileRequired:true}:{outcome:'authenticated',profileRequired:false},setCookies:recovered.setCookies};
    },
    async completeProfile(input) {
      const source=readAccountCookie(input.cookieHeader);if(source.kind!=='present'||!UUID.test(input.operationId))invalid();const keyId=source.value.split('.')[1]!,key=hmacKeyring.keys.find(k=>k.keyId===keyId);if(!key)invalid();
      const master=createHmac('sha256',key.key).update(JSON.stringify(['celebix/storefront-profile-completion/v1',input.hostname,input.operationId,accountCredentialDigestCandidates(source.value,hmacKeyring).find(candidate=>candidate.keyId===keyId)])).digest(),derivedRing={activeKeyId:keyId,keys:[{keyId,key:master}]};
      const nextSession=phoneOperationUuid('profile-session',input.hostname,input.operationId,input.operationId,derivedRing),customerId=phoneOperationUuid('profile-customer',input.hostname,input.operationId,input.operationId,derivedRing),sessionBytes=phoneOperationBytes('profile-token',input.hostname,input.operationId,input.operationId,derivedRing),csrfBytes=phoneOperationBytes('profile-csrf',input.hostname,input.operationId,input.operationId,derivedRing);
      const credential=createAccountSessionCredential({...hmacKeyring,activeKeyId:keyId},()=>sessionBytes),csrf=csrfBytes.toString('base64url');sessionBytes.fill(0);csrfBytes.fill(0);master.fill(0);
      const payload = { firstName: input.firstName, lastName: input.lastName, phone: input.phone ?? null };
      const result = await repository.completeProfile({ ...operationBase(input, payload, "profile_complete"), customerId, firstName: input.firstName, lastName: input.lastName, ...(input.phone ? { phone: input.phone } : {}), fullSessionId: nextSession, sessionKeyId: credential.keyId, sessionDigest: credential.digest, csrfDigest: accountCsrfDigest(nextSession, csrf, hmacKeyring,keyId).digest, deviceLabel: input.deviceLabel, userAgentDigest: accountUserAgentDigest(input.hostname, input.userAgent, hmacKeyring).digest });
      if(result.outcome==='updated'){try{await dependencies.bindCartIdentity?.({hostname:input.hostname,cookieHeader:input.cookieHeader,accountCookieHeader:serializeAccountCookie(credential.value)});}catch{/* Profile completion remains committed if enrichment is unavailable. */}}
      return Object.freeze({ result, setCookies: Object.freeze([serializeAccountCookie(credential.value), serializeCsrf(csrf)]) });
    },
    async session(hostname, cookieHeader) {
      const selected = credentials(cookieHeader);
      if (selected.length === 0) return Object.freeze({ outcome: "unauthenticated" as const, ...(cookieHeader ? { setCookie: serializeAccountCookieDeletion() } : {}) });
      const result = await repository.session({ hostname, now: nowValue(now), candidates: selected });
      return result.outcome === "unauthenticated" ? Object.freeze({ ...result, setCookie: serializeAccountCookieDeletion() }) : result;
    },
    async logout(hostname, cookieHeader) {
      const selected = credentials(cookieHeader);
      if (selected.length > 0) await repository.logout({ hostname, now: nowValue(now), candidates: selected, correlationId: correlation("logout", createHash("sha256").update(selected[0]!.digest).digest("hex").slice(0, 32)) });
      return Object.freeze({ setCookies: Object.freeze([serializeAccountCookieDeletion(), deleteCsrf(), serializeAccountChallengeCookieDeletion()]) });
    },
    async logoutAll(input) {
      const selected = requiredCredentials(input.cookieHeader);
      const revoked = await repository.logoutAll({ hostname: input.hostname, now: nowValue(now), candidates: selected, correlationId: `logout_all_${selected[0]!.digest.slice(0, 32)}` });
      return Object.freeze({ revoked, setCookies: Object.freeze([serializeAccountCookieDeletion(), deleteCsrf()]) });
    },
    async updateProfile(input) { const payload = { firstName: input.firstName, lastName: input.lastName, phone: input.phone ?? null, expectedVersion: input.expectedVersion }; return Object.freeze({ result: await repository.updateProfile({ ...operationBase(input, payload, "profile_update"), firstName: input.firstName, lastName: input.lastName, ...(input.phone ? { phone: input.phone } : {}), expectedVersion: input.expectedVersion }) }); },
    async saveAddress(input) { return Object.freeze({ result: await repository.saveAddress({ ...operationBase(input, { address: input.address, expectedVersion: input.expectedVersion }, "address_save"), address: input.address, expectedVersion: input.expectedVersion }) }); },
    async deleteAddress(input) { return Object.freeze({ result: await repository.deleteAddress({ ...operationBase(input, { addressId: input.addressId, expectedVersion: input.expectedVersion }, "address_delete"), addressId: input.addressId, expectedVersion: input.expectedVersion }) }); },
    async favorite(input) { return Object.freeze({ result: await repository.favorite({ ...operationBase(input, { productId: input.productId, enabled: input.enabled }, "favorite"), productId: input.productId, enabled: input.enabled }) }); },
    async orders(input) { return repository.orders({ hostname: input.hostname, now: nowValue(now), candidates: requiredCredentials(input.cookieHeader), limit: input.limit }); },
    async order(input) { return repository.order({ hostname: input.hostname, now: nowValue(now), candidates: requiredCredentials(input.cookieHeader), orderReference: input.orderReference }); },
    async devices(input) { return repository.devices({ hostname: input.hostname, now: nowValue(now), candidates: requiredCredentials(input.cookieHeader) }); },
    async revokeDevice(input) { return Object.freeze({ result: await repository.revokeDevice({ ...operationBase(input, { deviceId: input.deviceId }, "device_revoke"), deviceId: input.deviceId }) }); },
  };
  return Object.freeze(runtime);
}
