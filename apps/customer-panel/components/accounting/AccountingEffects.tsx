import type {AccountingEffectPreview} from "@/lib/accounting-ui/effects";
import {accountingMoney as money} from "@/lib/accounting-ui/model";
import styles from "./accounting.module.css";

export function AccountingEffects({preview,compact=false}:{preview:AccountingEffectPreview;compact?:boolean}) {
  return <section className={`${styles.effects}${compact?` ${styles.effectsCompact}`:""}`} aria-label="Kaydın etkisi" aria-live="polite" aria-atomic="true">
    <h3>{compact?"Kayıt özeti":"Kaydedince ne değişir?"}</h3>
    {preview.rows.map((row,index)=><div className={styles.effectRow} key={`${row.label}:${index}`}>
      <strong>{row.label}</strong>
      <dl className={styles.effectAmounts}>
        {row.beforeCents!==null?<div><dt>Önce</dt><dd>{money(row.beforeCents,row.currency)}</dd></div>:null}
        <div><dt>{row.beforeCents===null?"Kaydedilecek değişim":"Değişim"}</dt><dd>{row.changeCents>0?"+":""}{money(row.changeCents,row.currency)}</dd></div>
        {row.afterCents!==null?<div><dt>Sonra</dt><dd>{money(row.afterCents,row.currency)}</dd></div>:null}
      </dl>
    </div>)}
    {preview.error?<p className={styles.muted}>{preview.error}</p>:null}
    {preview.notes.map(note=><p key={note} className={styles.muted}>{note}</p>)}
    <p className={styles.effectNote}>{compact?"Önizleme · Güncel tutarlar kaydederken doğrulanır.":"Bu, son görünen kayıtlara göre bir önizlemedir. Kaydederken güncel tutarlar yeniden kontrol edilir."}</p>
  </section>;
}
