'use client';
import {MerchantSignupPhoneGate} from './MerchantSignupPhoneGate.tsx';
interface SelfServeDirectRegistrationFormProps { enabled:boolean; domainSuffix?:string; }
export function SelfServeDirectRegistrationForm({enabled,domainSuffix}:SelfServeDirectRegistrationFormProps) {
 return <MerchantSignupPhoneGate enabled={enabled}><form className="signup-form" action="/api/self-serve/register" method="post" aria-describedby="self-serve-registration-state">
  <div className="signup-name-row" data-signup-name-fields>
   <label htmlFor="signup-first-name"><span>Ad</span><input id="signup-first-name" name="firstName" autoComplete="given-name" placeholder="Adınız" required maxLength={100}/></label>
   <label htmlFor="signup-last-name"><span>Soyad</span><input id="signup-last-name" name="lastName" autoComplete="family-name" placeholder="Soyadınız" required maxLength={100}/></label>
  </div>
  <label htmlFor="signup-store-name"><span>Mağaza adı</span><input id="signup-store-name" name="storeName" autoComplete="organization" placeholder="Örnek Mağaza" required maxLength={120}/></label>
  <label htmlFor="signup-store-slug"><span>Mağaza adresi</span><div className="signup-slug"><input id="signup-store-slug" name="storeSlug" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="ornek-magaza" required minLength={3} maxLength={48} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" aria-describedby="signup-slug-hint"/>{domainSuffix && <span>.{domainSuffix}</span>}</div><span className="signup-sr-only" id="signup-slug-hint">Küçük harf, rakam ve kısa çizgi kullanın.</span></label>
  <div className="signup-consents">
   <label><input name="marketingConsent" type="checkbox" value="true"/><span>Fırsatlar ve bilgilendirmeler için ticari elektronik ileti almak istiyorum. (Opsiyonel)</span></label>
   <label><input name="privacyConsent" type="checkbox" value="true" required/><span><a href="https://celebix.net/tr/gizlilik" target="_blank" rel="noreferrer">KVKK, gizlilik ve açık rıza metinlerini</a> okudum; mağaza kaydı için kabul ediyorum.</span></label>
  </div>
 </form></MerchantSignupPhoneGate>;
}
