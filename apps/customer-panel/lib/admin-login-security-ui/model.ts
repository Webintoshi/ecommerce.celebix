export type AdminLoginPublicState = Readonly<{
  schemaVersion: 1;
  phase: "phone" | "code" | "new_phone" | "backup_codes" | "complete";
  purpose: "login" | "change_phone" | "manage";
  displayName: string;
  maskedPhone: string | null;
  challengeId: string | null;
  expiresAt: string | null;
  resendAt: string | null;
  enrolled: boolean;
  backupCodesRemaining: number;
  backupCodes?: readonly string[];
}>;
export type AdminSecurityPublicState = Readonly<{
  maskedPhone: string | null;
  backupCodesRemaining: number;
  trustedDevices: readonly Readonly<{deviceId: string; createdAt: string; expiresAt: string}>[];
  enabled: boolean;
}>;
export function securityErrorMessage(code: string): string {
  switch (code) {
    case "invalid_phone": return "Telefon numarasını ülke koduyla girin.";
    case "invalid_code": case "otp_invalid": return "Kod doğrulanamadı. Kontrol edip tekrar deneyin.";
    case "invalid_backup_code": case "backup_code_invalid": return "Yedek kod doğrulanamadı. Kullanılmamış bir kod girin.";
    case "challenge_expired": case "otp_expired": case "not_ready": return "Kodun süresi doldu. Yeni kod isteyin.";
    case "rate_limited": case "resend_not_ready": case "resend_wait": return "Biraz bekleyip tekrar deneyin.";
    case "pending_expired": case "unauthorized": case "fresh_login_required": return "Girişin süresi doldu. Güvenli girişi yeniden başlatın.";
    case "delivery_failed": case "delivery_unavailable": return "Kod gönderilemedi. Tekrar deneyin.";
    case "locked": return "Çok fazla hatalı kod girildi. Yeni kod isteyin.";
    case "delivery_uncertain": return "Kodun gönderildiği doğrulanamadı. Otomatik tekrar gönderilmedi; bekleyip yeni kod isteyin.";
    case "operation_uncertain": return "İşlemin sonucu doğrulanamadı. Bilgilerin korundu; aynı işlemi tekrar deneyin.";
    case "management_restart_required": return "Giriş adımı tamamlanamadı. Güvenli giriş adımını yeniden başlatın.";
    case "device_unavailable": return "Bu cihazın hatırlama bilgisi bulunamadı. Tüm cihazları unutabilirsiniz.";
    default: return "İşlem tamamlanamadı. Tekrar deneyin.";
  }
}
export class AdminSecurityUiError extends Error {
  readonly code: string;
  constructor(code = "unavailable") { super(securityErrorMessage(code)); this.name="AdminSecurityUiError"; this.code=code; }
}
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminSecurityUiError();
  const result = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(result,key)) || Object.keys(result).some(key => ![...required,...optional].includes(key))) throw new AdminSecurityUiError();
  return result;
}
function string(value: unknown, maximum=160): string {
  if(typeof value!=="string" || !value.length || value.length>maximum) throw new AdminSecurityUiError();
  return value;
}
function timestamp(value: unknown): string {
  const text=string(value,40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text))) throw new AdminSecurityUiError();
  return text;
}
function count(value: unknown): number {
  if(!Number.isSafeInteger(value) || (value as number)<0 || (value as number)>10) throw new AdminSecurityUiError();
  return value as number;
}
export function parseLoginState(value: unknown): AdminLoginPublicState {
  const s=record(value,["schemaVersion","phase","purpose","displayName","maskedPhone","challengeId","expiresAt","resendAt","enrolled","backupCodesRemaining"],["backupCodes"]);
  if(s.schemaVersion!==1 || !["phone","code","new_phone","backup_codes","complete"].includes(String(s.phase)) || !["login","change_phone","manage"].includes(String(s.purpose)) || typeof s.enrolled!=="boolean") throw new AdminSecurityUiError();
  const result: AdminLoginPublicState={schemaVersion:1,phase:s.phase as AdminLoginPublicState["phase"],purpose:s.purpose as AdminLoginPublicState["purpose"],displayName:string(s.displayName),maskedPhone:s.maskedPhone===null?null:string(s.maskedPhone,60),challengeId:s.challengeId===null?null:string(s.challengeId),expiresAt:s.expiresAt===null?null:timestamp(s.expiresAt),resendAt:s.resendAt===null?null:timestamp(s.resendAt),enrolled:s.enrolled,backupCodesRemaining:count(s.backupCodesRemaining)};
  if(s.backupCodes!==undefined){
    if(s.phase!=="backup_codes"||!Array.isArray(s.backupCodes)||s.backupCodes.length!==10||new Set(s.backupCodes).size!==10) throw new AdminSecurityUiError();
    return Object.freeze({...result,backupCodes:Object.freeze(s.backupCodes.map(code=>string(code,80)))});
  }
  return Object.freeze(result);
}
export function parseSecurityState(value: unknown): AdminSecurityPublicState {
  const s=record(value,["maskedPhone","backupCodesRemaining","trustedDevices","enabled"]);
  if(typeof s.enabled!=="boolean"||!Array.isArray(s.trustedDevices)||s.trustedDevices.length>200) throw new AdminSecurityUiError();
  return Object.freeze({maskedPhone:s.maskedPhone===null?null:string(s.maskedPhone,60),backupCodesRemaining:count(s.backupCodesRemaining),enabled:s.enabled,trustedDevices:Object.freeze(s.trustedDevices.map(value=>{const device=record(value,["deviceId","createdAt","expiresAt"]);return Object.freeze({deviceId:string(device.deviceId),createdAt:timestamp(device.createdAt),expiresAt:timestamp(device.expiresAt)});} ))});
}
export function safeSecurityRedirect(value: unknown, authorityOrigin: string, panelOrigin: string): string {
  try {
    const authority=new URL(authorityOrigin),panel=new URL(panelOrigin);
    if(authority.protocol!=="https:"||panel.protocol!=="https:"||authority.username||authority.password||panel.username||panel.password||authority.pathname!=="/"||authority.search||authority.hash||panel.pathname!=="/"||panel.search||panel.hash) throw new Error();
    if(typeof value!=="string"||value.length>8192||/[\\\u0000-\u0020]/.test(value)) throw new Error();
    const url=new URL(value,panel.origin);
    if(url.protocol!=="https:"||url.username||url.password) throw new Error();
    if(url.origin===authority.origin || (url.origin===panel.origin&&url.pathname.startsWith("/auth/"))) return url.href;
  } catch { /* Fail closed without exposing authorization response details. */ }
  throw new AdminSecurityUiError();
}
export function normalizeCode(value: string): string { return value.replace(/\D/g,"").slice(0,6); }
export function normalizePhone(value: string): string { return value.trim().replace(/[\s()\-]/g,""); }
export function validPhone(value: string): boolean { return /^\+[1-9]\d{7,14}$/.test(normalizePhone(value)); }
export function secondsUntil(value: string|null, now: number): number {return value?Math.max(0,Math.ceil((Date.parse(value)-now)/1000)):0;}
export type AdminSecurityHandoff = Readonly<{url:string;transfer:string}>;
export function safeSecurityHandoff(value:unknown,centralOrigin:string,action:"start"|"forget"):AdminSecurityHandoff {
 const row=record(value,["url","transfer"]);
 const origin=new URL(centralOrigin);
 if(origin.protocol!=="https:"||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash)throw new AdminSecurityUiError();
 const url=`${origin.origin}/auth/admin-security/${action}`;
 if(row.url!==url||typeof row.transfer!=="string"||row.transfer.length>16384||!/^ase1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(row.transfer))throw new AdminSecurityUiError();
 return Object.freeze({url,transfer:row.transfer});
}
export function submitAdminSecurityHandoff(handoff:AdminSecurityHandoff):void {
 const form=document.createElement("form");form.method="post";form.action=handoff.url;form.hidden=true;
 const input=document.createElement("input");input.type="hidden";input.name="transfer";input.value=handoff.transfer;form.append(input);document.body.append(form);
 try{form.submit();}finally{form.remove();}
}
