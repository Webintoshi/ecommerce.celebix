'use client';
import {useId} from 'react';
import type {ProductTaxChoice} from '@celebix/saas-contracts';
import {safeTaxChoice,sellingPriceCents,taxLabel,taxRateInput,type PriceEntryBasis} from '@/lib/catalog-ui/product-tax';
import {parseTurkishMoneyToCents} from '@/lib/catalog-onboarding-ui/forms';
import {formatTurkishMoney} from '@/lib/catalog-ui/money';
import styles from './product-tax.module.css';
const COMMON=['0','100','1000','2000'];
export function ProductTaxFields({value,onChange,productTax=null,variant=false,required=false,disabled=false,allowUnspecified=true,name='taxChoice',label='KDV oranı'}:Readonly<{value:string;onChange(value:string):void;productTax?:ProductTaxChoice|null;variant?:boolean;required?:boolean;disabled?:boolean;allowUnspecified?:boolean;name?:string;label?:string}>){
 const id=useId(),custom=value.startsWith('custom:')||Boolean(value&&!['inherit','exempt',...COMMON].includes(value));
 const customValue=value.startsWith('custom:')?value.slice(7):custom?taxRateInput(Number(value)):'';
 return <div className={styles.fields}><input type="hidden" name={name} value={value}/><label className={styles.field} htmlFor={id}><span>{label}{required?' *':''}</span><select id={id} aria-label={label} value={custom?'custom':value||''} required={required} disabled={disabled} onChange={event=>onChange(event.target.value==='custom'?'custom:':event.target.value)}>
 {variant?<option value="">Üründen kullan · {taxLabel(productTax)}</option>:<option value="" disabled={required||!allowUnspecified}>Belirtilmedi</option>}{COMMON.map(rate=><option key={rate} value={rate}>%{taxRateInput(Number(rate))}</option>)}<option value="custom">Diğer oran</option><option value="exempt">KDV muaf</option></select></label>
 {custom?<label className={styles.field}><span>KDV oranı (%)</span><input aria-label={`${label} özel oran (%)`} inputMode="decimal" maxLength={6} value={customValue} required disabled={disabled} onChange={event=>onChange('custom:'+event.target.value)}/></label>:null}
 </div>;
}
export function ProductPriceBasis({value,onChange,price,tax,disabled=false,name='priceBasis'}:Readonly<{value:PriceEntryBasis;onChange(value:PriceEntryBasis):void;price:string;tax:ProductTaxChoice|null;disabled?:boolean;name?:string}>){
 const entered=parseTurkishMoneyToCents(price),gross=entered===null?null:sellingPriceCents(entered,value,tax);
 return <div className={styles.basis}><label className={styles.field}><span>Fiyat girişi</span><select aria-label="Fiyat girişi" name={name} value={value} disabled={disabled} onChange={event=>onChange(event.target.value as PriceEntryBasis)}><option value="included">KDV dahil satış tutarı</option><option value="excluded">KDV hariç tutar gir</option></select></label>{value==='excluded'?<p className={styles.help} role="status">{gross===null?'Toplam için KDV seçin ve geçerli fiyat girin.':`Müşterinin ödeyeceği satış fiyatı: ${formatTurkishMoney(gross,'TRY')}`}</p>:<p className={styles.help}>KDV seçimi satış tutarını değiştirmez.</p>}</div>;
}
