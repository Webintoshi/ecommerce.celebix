"use client";
import {useEffect,useState} from 'react';
import type {NativeMarketingSettings} from '@celebix/saas-data';
import type {MarketingCommand} from '@/lib/native-marketing-ui/model';
import styles from './native-marketing.module.css';
export function CartReminderSettings({settings,canManage,disabled,onExecute,onDirtyChange}:Readonly<{settings:NativeMarketingSettings;canManage:boolean;disabled:boolean;onExecute:(command:MarketingCommand)=>void;onDirtyChange:(dirty:boolean)=>void}>){
 const [enabled,setEnabled]=useState(settings.cartReminderEnabled),[second,setSecond]=useState(settings.secondCartReminderEnabled);
 useEffect(()=>{setEnabled(settings.cartReminderEnabled);setSecond(settings.secondCartReminderEnabled);},[settings.version,settings.cartReminderEnabled,settings.secondCartReminderEnabled]);
 const dirty=enabled!==settings.cartReminderEnabled||second!==settings.secondCartReminderEnabled;
 useEffect(()=>onDirtyChange(dirty),[dirty,onDirtyChange]);
 return <div className={styles.settings}><h2 className={styles.sectionTitle}>Otomatik hatırlatma</h2>
  <label className={styles.switch}><input type="checkbox" aria-label="Sepet hatırlatmasını etkinleştir" checked={enabled} disabled={!canManage||disabled} onChange={event=>setEnabled(event.target.checked)}/><span><strong>Sepet hatırlatmasını etkinleştir</strong><small>Son sepet hareketinden 1 saat sonra bir e-posta gönderilir.</small></span></label>
  <label className={styles.switch}><input type="checkbox" aria-label="İkinci sepet hatırlatması" checked={second} disabled={!canManage||disabled||!enabled} onChange={event=>setSecond(event.target.checked)}/><span><strong>İkinci hatırlatma</strong><small>Satın alma tamamlanmadıysa son hareketten 24 saat sonra.</small></span></label>
  <p className={styles.note}>Mağaza logonuz ve renkleriniz hazır şablona otomatik eklenir. Satın alan, abonelikten çıkan veya uygun e-posta izni bulunmayan müşterilere gönderilmez. Yalnızca telefonla giriş yapan müşterinin e-posta adresi yoksa hatırlatma gönderilemez.</p>
  {canManage?<div className={styles.actions}><button type="button" className="button button-primary" disabled={disabled||!dirty} onClick={()=>onExecute({kind:'cart-settings',operationId:crypto.randomUUID(),body:{expectedVersion:settings.version,enabled:true,cartReminderEnabled:enabled,secondCartReminderEnabled:enabled&&second}})}>Uygula</button><button type="button" className="button button-secondary" disabled={disabled||!dirty} onClick={()=>{setEnabled(settings.cartReminderEnabled);setSecond(settings.secondCartReminderEnabled);}}>Vazgeç</button></div>:null}
 </div>;
}
