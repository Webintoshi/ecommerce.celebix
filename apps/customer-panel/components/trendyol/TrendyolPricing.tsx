'use client';
import { calculateTrendyolPrice, type TrendyolPricingRule } from '@celebix/saas-contracts';
import { money, type PricingDraft } from '@/lib/trendyol-ui/model';
import styles from './trendyol.module.css';

export function TrendyolPricingFields({draft,disabled,onChange}:Readonly<{draft:PricingDraft;disabled:boolean;onChange:(draft:PricingDraft)=>void}>){
  const change=<K extends keyof PricingDraft>(key:K,value:PricingDraft[K])=>onChange({...draft,[key]:value});
  function amount(label:string,key:'commission'|'commissionVat'|'shipping'|'otherFee'|'productVat'|'withholding') {return <label className={styles.field}>{label}<input aria-label={label} inputMode="decimal" value={draft[key]} disabled={disabled} onChange={event=>change(key,event.target.value)}/></label>;}
  return <div className={styles.pricingFields}>
    <div className={styles.formGrid}>{amount('Komisyon (%)','commission')}{amount('Ortalama kargo (TL)','shipping')}</div>
    <label className={styles.check}><input type="checkbox" checked={draft.commissionVatIncluded} disabled={disabled} onChange={event=>change('commissionVatIncluded',event.target.checked)}/>Komisyon oranına KDV dahil</label>
    <details className={styles.advanced}><summary>Vergi, stopaj ve diğer kesintiler</summary><div className={styles.formGrid}>
      {!draft.commissionVatIncluded?amount('Komisyon KDV’si (%)','commissionVat'):null}{amount('Diğer kesinti (TL)','otherFee')}{amount('Örnek ürün KDV’si (%)','productVat')}{amount('Stopaj (%)','withholding')}
      <label className={styles.field}>Fiyat yuvarlama<select value={draft.rounding} disabled={disabled} onChange={event=>change('rounding',event.target.value as PricingDraft['rounding'])}><option value="cent">Kuruşa yukarı</option><option value="lira">Tam liraya yukarı</option><option value="ninety">,90 ile bitecek şekilde yukarı</option></select></label>
    </div><label className={styles.check}><input type="checkbox" checked={draft.coverWithholding} disabled={disabled} onChange={event=>change('coverWithholding',event.target.checked)}/>Stopajı da fiyatla karşıla</label><p className={styles.help}>Kapalıyken web tutarı stopaj öncesinde korunur. Beklenen ödeme stopaj kesintisini her zaman içerir.</p></details>
  </div>;
}

export function TrendyolPricePreview({webPriceCents,rule,example=false}:Readonly<{webPriceCents:number;rule:TrendyolPricingRule;example?:boolean}>){
  let price;try{price=calculateTrendyolPrice(webPriceCents,rule);}catch{return <p className={styles.help}>Hesaplama için geçerli fiyat ve kesinti bilgileri girin.</p>;}
  return <div className={styles.pricePreview} aria-label={example?'Örnek fiyat hesaplaması':'Trendyol fiyat hesaplaması'}>
    <dl><div><dt>Web fiyatı</dt><dd>{money(webPriceCents)}</dd></div><div className={styles.previewPrice}><dt>Trendyol satış fiyatı</dt><dd>{money(price.salePriceCents)}</dd></div><div><dt>Komisyon{rule.commissionVatIncluded?' (KDV dahil)':''}</dt><dd>− {money(price.commissionCents)}</dd></div>{price.commissionVatCents?<div><dt>Komisyon KDV’si</dt><dd>− {money(price.commissionVatCents)}</dd></div>:null}<div><dt>Ortalama kargo</dt><dd>− {money(price.shippingCents)}</dd></div>{price.otherFeeCents?<div><dt>Diğer kesinti</dt><dd>− {money(price.otherFeeCents)}</dd></div>:null}<div><dt>Stopaj</dt><dd>− {money(price.withholdingCents)}</dd></div><div className={styles.previewNet}><dt>Beklenen ödeme</dt><dd>{money(price.expectedPaymentCents)}</dd></div></dl>
    <p className={styles.help}>{rule.coverWithholding?'Web tutarı stopaj dahil kesintilerden sonra korunur.':'Web tutarı stopaj öncesinde korunur.'} Ortalama giderlerle hesaplanan bu tutar kâr değildir.{example?' Örnek hesap mağaza ayarlarını değiştirmez.':''}</p>
  </div>;
}
