"use client";
import {useMemo,useState} from "react";
import {ChevronDown,ChevronUp,Trash2} from "lucide-react";
import type {StorefrontDesignDestinationOption} from "@celebix/saas-contracts";
import styles from "../design-settings.module.css";

export function filterPickerProducts(destinations:readonly StorefrontDesignDestinationOption[],query:string,categoryId:string):readonly StorefrontDesignDestinationOption[] {
 const term=query.trim().toLocaleLowerCase("tr");
 return destinations.filter(item=>item.kind==="product"&&(!categoryId||item.categoryIds?.includes(categoryId))&&(!term||[item.label,...(item.searchTerms??[])].some(value=>value.toLocaleLowerCase("tr").includes(term))));
}
export function ProductPicker({destinations,selectedIds,disabled,onChange,loading=false,error=""}:Readonly<{destinations:readonly StorefrontDesignDestinationOption[];selectedIds:readonly string[];disabled:boolean;onChange:(ids:readonly string[])=>void;loading?:boolean;error?:string}>) {
 const [query,setQuery]=useState(""),[categoryId,setCategoryId]=useState("");
 const products=destinations.filter(item=>item.kind==="product"), categories=destinations.filter(item=>item.kind==="collection");
 const results=useMemo(()=>filterPickerProducts(destinations,query,categoryId),[destinations,query,categoryId]);
 const move=(index:number,direction:-1|1)=>{const ids=[...selectedIds];[ids[index],ids[index+direction]]=[ids[index+direction]!,ids[index]!];onChange(ids);};
 return <fieldset className={styles.productPicker}><legend>Ürün seçimi · {selectedIds.length}/12</legend>
  <label>Ad, SKU veya barkod ara<input type="search" value={query} disabled={disabled} onChange={event=>setQuery(event.target.value)}/></label>
  <label>Kategori filtresi<select value={categoryId} disabled={disabled} onChange={event=>setCategoryId(event.target.value)}><option value="">Tüm kategoriler</option>{categories.map(item=><option key={item.resourceId} value={item.resourceId}>{item.label}</option>)}</select></label>
  {selectedIds.length?<><h4>Seçilenler · vitrin sırası</h4><ol className={styles.productPickerList}>{selectedIds.map((id,index)=>{const item=products.find(product=>product.resourceId===id);return <li key={id}><span className={styles.productPickerIdentity}>{item?.imageUrl?<img src={item.imageUrl} alt=""/>:null}<span><b>{index+1}. {item?.label??"Ürün bulunamadı"}</b><small>{item?.available===false?"Stokta yok · vitrinde gösterilmez":!item?"Seçimi kaldırın veya kataloğu kontrol edin":item.searchTerms?.slice(0,2).join(" · ")}</small></span></span><div className={styles.homepageItemActions}><button type="button" aria-label={`${item?.label??"Ürün"} yukarı taşı`} disabled={disabled||index===0} onClick={()=>move(index,-1)}><ChevronUp size={16}/></button><button type="button" aria-label={`${item?.label??"Ürün"} aşağı taşı`} disabled={disabled||index===selectedIds.length-1} onClick={()=>move(index,1)}><ChevronDown size={16}/></button><button type="button" aria-label={`${item?.label??"Ürün"} seçimini kaldır`} disabled={disabled} onClick={()=>onChange(selectedIds.filter(value=>value!==id))}><Trash2 size={16}/></button></div></li>;})}</ol></>:<p className={styles.homepageHelp}>Uygulamadan önce en az bir ürün seçin.</p>}
  {loading?<p role="status">Ürünler yükleniyor…</p>:error?<p role="alert" className={styles.fieldError}>{error}</p>:!products.length?<p className={styles.homepageHelp}>Etkin ürün yok. Katalogdan ürün ekleyin.</p>:!results.length?<p className={styles.homepageHelp}>Aramaya uygun ürün yok. Aramayı veya filtreyi değiştirin.</p>:<><h4>Ürünler · {results.length}</h4><ul className={styles.productPickerList}>{results.map(item=>{const selected=selectedIds.includes(item.resourceId);return <li key={item.resourceId}><span className={styles.productPickerIdentity}>{item.imageUrl?<img src={item.imageUrl} alt=""/>:null}<span><b>{item.label}</b><small>{item.searchTerms?.slice(0,2).join(" · ")}{item.priceCents!==undefined?` · ${new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(item.priceCents/100)}`:""}{item.available===false?" · Stokta yok":""}</small></span></span><button className={styles.homepageInlineButton} type="button" disabled={disabled||selected||selectedIds.length>=12} onClick={()=>{if(!selected&&selectedIds.length<12)onChange([...selectedIds,item.resourceId]);}}>{selected?"Seçildi":"Seç"}</button></li>;})}</ul></>}
  <p className={styles.homepageHelp}>En fazla 12 ürün. Stokta olmayan seçimin yerine başka ürün eklenmez.</p>
 </fieldset>;
}
