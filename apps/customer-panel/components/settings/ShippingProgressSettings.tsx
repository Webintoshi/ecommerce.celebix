"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicStarterThemePresentationV2 } from "@celebix/saas-contracts";
import { formatTurkishMoneyInput, parseTurkishMoneyToCents } from "@/lib/catalog-ui/money";
import styles from "./starter-theme-composer.module.css";

function parseThresholdCents(value:string):number {
 const typed=value.trim();
 const normalized=/^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?$/.test(typed)
  ? typed.replaceAll(".","")
  : typed.replace(".",",");
 return parseTurkishMoneyToCents(normalized);
}

export function ShippingProgressSettings({cart,disabled,onChange,onValidationChange}:Readonly<{cart:PublicStarterThemePresentationV2["cart"];disabled:boolean;onChange:(cart:PublicStarterThemePresentationV2["cart"])=>void;onValidationChange?:(invalid:boolean)=>void}>){
 const [amount,setAmount]=useState(()=>cart.freeShippingThresholdCents===undefined?"":formatTurkishMoneyInput(cart.freeShippingThresholdCents));
 const written=useRef<number | undefined>(undefined);
 useEffect(()=>{if(written.current!==cart.freeShippingThresholdCents)setAmount(cart.freeShippingThresholdCents===undefined?"":formatTurkishMoneyInput(cart.freeShippingThresholdCents));written.current=undefined;},[cart.freeShippingThresholdCents]);
 let cents:number|null=null;
 try{cents=parseThresholdCents(amount);if(cents<1||cents>100_000_000)cents=null;}catch{cents=null;}
 const invalid=cart.showShippingProgress&&cents===null;
 useEffect(()=>{onValidationChange?.(invalid);return()=>onValidationChange?.(false);},[invalid,onValidationChange]);
 return <><label className={styles.check}><input type="checkbox" checked={cart.showShippingProgress} disabled={disabled} onChange={event=>onChange({...cart,showShippingProgress:event.currentTarget.checked})}/>Ücretsiz kargo çubuğunu göster</label>
 {cart.showShippingProgress?<><label>Ücretsiz kargo eşiği (TL)<input inputMode="decimal" value={amount} maxLength={16} disabled={disabled} aria-invalid={invalid} aria-describedby="shipping-threshold-help shipping-threshold-error" onChange={event=>{const value=event.currentTarget.value;setAmount(value);try{const parsed=parseThresholdCents(value);if(parsed>=1&&parsed<=100_000_000){written.current=parsed;onChange({...cart,freeShippingThresholdCents:parsed});}}catch{/* Keep incomplete input until the merchant corrects it. */}}}/></label><p className={styles.fieldHelp} id="shipping-threshold-help">Uygula ile bu tutara ulaşan sepetlerde kargo ücretsiz olur. Eşik, kupon indiriminden önceki ürün toplamına göre hesaplanır. Mevcut teslimat ücretiniz eşik altında korunur.</p>{invalid?<p className={styles.error} id="shipping-threshold-error" role="alert">0,01 ile 1.000.000 TL arasında bir tutar girin.</p>:null}<p className={styles.fieldHelp}>Kapatıldığında bu eşik uygulanmaz; kargo ayarlarındaki teslimat ücreti kullanılır.</p></>:null}</>;
}
