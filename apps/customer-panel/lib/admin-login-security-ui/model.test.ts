import assert from "node:assert/strict";
import test from "node:test";
import { parseLoginState, parseSecurityState, safeSecurityRedirect, securityErrorMessage, normalizeCode } from "./model.ts";
const state = {schemaVersion:1,phase:"code",purpose:"login",displayName:"Butik",maskedPhone:"+90 ••• 1234",challengeId:"challenge",expiresAt:"2026-10-12T12:00:00.000Z",resendAt:null,enrolled:true,backupCodesRemaining:10};
test("public state rejects credentials and recovery material outside a new batch", () => {
 assert.equal(parseLoginState(state).phase,"code");
 assert.throws(()=>parseLoginState({...state,sessionToken:"secret"}));
 assert.throws(()=>parseLoginState({...state,backupCodes:["SECRET"]}));
 assert.throws(()=>parseLoginState({...state,phase:"backup_codes",backupCodes:Array(9).fill("code")}));
 const codes=Array.from({length:10},(_,n)=>`CODE-${n}`);
 assert.deepEqual(parseLoginState({...state,phase:"backup_codes",backupCodes:codes}).backupCodes,codes);
 assert.throws(()=>parseSecurityState({maskedPhone:null,backupCodesRemaining:10,trustedDevices:[],enabled:true,secret:"secret"}));
});
test("redirect accepts only configured HTTPS authority or same origin auth paths",()=>{
 const authority="https://identity.celebix.test",panel="https://panel.celebix.test";
 assert.equal(safeSecurityRedirect("https://identity.celebix.test/oidc/auth?state=value",authority,panel),"https://identity.celebix.test/oidc/auth?state=value");
 assert.equal(safeSecurityRedirect("/auth/admin-security/start",authority,panel),"https://panel.celebix.test/auth/admin-security/start");
 for(const url of ["https://evil.test/auth","javascript:alert(1)","https://identity.celebix.test.evil.test/oidc","https://identity.celebix.test@evil.test/","https://panel.celebix.test/settings","https://panel.celebix.test/auth/../settings","http://identity.celebix.test/oidc","//evil.test/auth"]){assert.throws(()=>safeSecurityRedirect(url,authority,panel));}
 assert.throws(()=>safeSecurityRedirect("https://identity.celebix.test/oidc","http://identity.celebix.test",panel));
});
test("code paste preserves leading zeros and unknown errors never disclose raw detail",()=>{
 assert.equal(normalizeCode("00 12-34"),"001234");
 assert.equal(normalizeCode("0012347"),"001234");
 assert.equal(securityErrorMessage("database_password=secret"),"İşlem tamamlanamadı. Tekrar deneyin.");
 assert.match(securityErrorMessage("invalid_code"),/Kod/);
});
test("settings navigation includes personal security without losing existing destinations",async()=>{
 const{SETTINGS_DESTINATIONS}=await import("../../components/settings/settings-navigation.ts");
 assert.ok(SETTINGS_DESTINATIONS.some(item=>item.href==="/settings/security"));
 const{PANEL_NAVIGATION}=await import("../panel-ui/navigation.ts");assert.ok(PANEL_NAVIGATION.find(item=>item.key==="settings")?.children?.some(item=>item.href==="/settings/security"));
});
test("independent security link stays reachable in ordinary and cashier sidebar footer",async()=>{
 const React=await import("react"),{renderToStaticMarkup}=await import("react-dom/server"),{compile}=await import("../../components/settings/design/design-editor-test-utils.ts");
 const {PanelSidebar}=compile<any>(new URL("../../components/panel/PanelSidebar.tsx",import.meta.url),{"next/link":{__esModule:true,default:({children,...props}:any)=>React.createElement("a",props,children)},"next/image":{__esModule:true,default:(props:any)=>React.createElement("img",props)},"./PanelNavigation":{PanelNavigation:()=>null},"./LogoutButton":{LogoutButton:()=>null},"./StoreSwitcher":{StoreSwitcher:()=>null}});
 for(const membershipLabel of ["Mağaza sahibi","Mağaza yöneticisi","İçerik editörü","Analist","Kasiyer"]){const html=renderToStaticMarkup(React.createElement(PanelSidebar,{mode:"desktop",model:{storeSlug:"butik",membershipLabel,locale:"tr",planCode:"basic",planVersion:1,entitlementStatus:"active",...(membershipLabel==="Kasiyer"?{navigationMode:"register"}:{})}}));assert.match(html,/href="\/settings\/security"/);assert.match(html,/Giriş güvenliği/);}
});
test("uncertain delivery and security failures explain a safe next action without clearing forms",()=>{
 assert.match(securityErrorMessage("delivery_uncertain"),/Otomatik tekrar gönderilmedi/);
 assert.match(securityErrorMessage("operation_uncertain"),/aynı işlemi/);
 assert.match(securityErrorMessage("locked"),/Yeni kod/);
 assert.match(securityErrorMessage("fresh_login_required"),/yeniden başlat/);
});
