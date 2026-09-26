"use client";

import type { StarterThemeSectionConfigV3, StarterCampaignPanelConfig, StorefrontDesignAssetOption, StorefrontDesignDestinationOption } from "@celebix/saas-contracts";
import { ChevronDown, ChevronUp, Trash2, Plus } from "lucide-react";
import { ProductPicker } from "./ProductPicker";
import styles from "../design-settings.module.css";

type FieldErrors = Readonly<Record<string, string>>;
export function sectionFieldErrors(section: StarterThemeSectionConfigV3): FieldErrors {
  const errors: Record<string,string> = {};
  if ("heading" in section && !section.heading.trim()) errors.heading = "Başlık yazın. Son geçerli taslak korunuyor.";
  if (section.kind === "brand_story" && !section.body.trim()) errors.body = "Hikâye metni yazın.";
  if (section.kind === "product_row" && section.source === "category" && !section.categoryId) errors.categoryId = "Kategori seçin.";
  if (section.kind === "split_campaign") section.panels.forEach((panel,index) => {
    if (!panel.heading.trim()) errors[`panel${index}Heading`] = "Başlık yazın.";
    if (!panel.assetId) errors[`panel${index}Asset`] = "Kampanya görseli seçin.";
    if (!panel.destination) errors[`panel${index}Destination`] = "Bağlantı seçin.";
  });
  if (section.kind === "value_propositions") section.items.forEach((item,index) => {
    if (!item.heading.trim()) errors[`value${index}Heading`] = "Başlık yazın.";
    else if (section.items.some((candidate,position)=>position!==index&&candidate.heading.trim()===item.heading.trim())) errors[`value${index}Heading`] = "Her değer için farklı başlık yazın.";
    if (!item.body.trim()) errors[`value${index}Body`] = "Açıklama yazın.";
  });
  return errors;
}

export function HomepageSectionFields({ section, assets, destinations, disabled, errors, onUpdate }: Readonly<{
 section:StarterThemeSectionConfigV3; assets:readonly StorefrontDesignAssetOption[]; destinations:readonly StorefrontDesignDestinationOption[]; disabled:boolean; errors:FieldErrors; onUpdate:(next:StarterThemeSectionConfigV3)=>void;
}>) {
 const categories=destinations.filter(({kind})=>kind==="collection");
 const heroAssets=assets.filter(({kind})=>kind==="hero"), categoryAssets=assets.filter(({kind})=>kind==="category");
 const paths=destinations.map(({path,label})=>({path,label}));
 const error=(key:string)=>errors[key] ? <small id={`homepage-error-${key}`} className={styles.fieldError} role="alert">{errors[key]}</small> : null;
 const heading="heading" in section ? <label>Başlık<input maxLength={160} disabled={disabled} value={section.heading} aria-invalid={Boolean(errors.heading)} aria-describedby={errors.heading ? "homepage-error-heading" : undefined} onChange={event=>onUpdate({...section,heading:event.target.value})}/>{error("heading")}</label>:null;
 const assetOptions=(items:readonly StorefrontDesignAssetOption[],value:string)=> <>{value&&!items.some(item=>item.id===value)?<option value={value}>Mevcut görsel · arşivde yok</option>:null}{items.map(item=><option key={item.id} value={item.id}>{item.altText||"Adsız görsel"} · {item.width}×{item.height}</option>)}</>;
 if(section.kind==="category_grid") return <div className={styles.homepageInspectorFields}>
  {heading}
  <fieldset><legend>Görsel düzeni</legend><div className={styles.homepageChoiceGrid}>{(["duo","grid"] as const).map(layout=><label key={layout}><input type="radio" name={`layout-${section.sectionId}`} disabled={disabled} checked={section.layout===layout} onChange={()=>onUpdate({...section,layout})}/><span><b>{layout==="duo"?"İki büyük görsel":"Düzenli ızgara"}</b><small>{layout==="duo"?"Telefonda alt alta":"Telefonda iki sütun"}</small></span></label>)}</div></fieldset>
  <fieldset><legend>Kategoriler · {section.categoryIds.length}/8</legend><div className={styles.homepageCheckList}>{categories.map(category=><label key={category.resourceId}><input type="checkbox" disabled={disabled||(!section.categoryIds.includes(category.resourceId)&&section.categoryIds.length>=8)} checked={section.categoryIds.includes(category.resourceId)} onChange={event=>onUpdate({...section,categoryIds:event.target.checked?[...section.categoryIds,category.resourceId]:section.categoryIds.filter(id=>id!==category.resourceId),...(section.categoryImages?{categoryImages:section.categoryImages.filter(item=>event.target.checked||item.categoryId!==category.resourceId)}:{})})}/><span>{category.label}</span></label>)}</div>{!categories.length?<p className={styles.homepageHelp}>Etkin kategori yok. Katalogdan kategori ekleyin.</p>:null}{section.categoryIds.length>=8?<p className={styles.homepageHelp}>En fazla 8 kategori seçilebilir.</p>:null}</fieldset>
  {section.categoryIds.map((categoryId,index)=>{
   const category=categories.find(item=>item.resourceId===categoryId), selectedImage=section.categoryImages?.find(item=>item.categoryId===categoryId)?.assetId??"";
   const move=(direction:-1|1)=>{const ids=[...section.categoryIds];[ids[index],ids[index+direction]]=[ids[index+direction]!,ids[index]!];onUpdate({...section,categoryIds:ids});};
   return <fieldset key={categoryId}><legend>{index+1}. {category?.label??"Kategori bulunamadı"}</legend><div className={styles.homepageItemActions}><button type="button" disabled={disabled||index===0} aria-label={`${category?.label??"Kategori"} yukarı taşı`} onClick={()=>move(-1)}><ChevronUp size={16}/></button><button type="button" disabled={disabled||index===section.categoryIds.length-1} aria-label={`${category?.label??"Kategori"} aşağı taşı`} onClick={()=>move(1)}><ChevronDown size={16}/></button></div>
   <label>Kart görseli<select disabled={disabled} value={selectedImage} onChange={event=>{const categoryImages=(section.categoryImages??[]).filter(item=>item.categoryId!==categoryId);if(event.target.value)categoryImages.push({categoryId,assetId:event.target.value});onUpdate({...section,categoryImages});}}><option value="">Görsel seçin</option>{assetOptions(categoryAssets,selectedImage)}</select></label>{selectedImage?null:<p className={styles.homepageHelp}>Yayınlamadan önce bu kategoriye görsel seçin.</p>}
   {categoryAssets.find(item=>item.id===selectedImage)?.url?<img className={styles.homepageAssetThumbnail} src={categoryAssets.find(item=>item.id===selectedImage)!.url} alt={categoryAssets.find(item=>item.id===selectedImage)!.altText}/>:null}
   </fieldset>;
  })}
  {!categoryAssets.length?<p className={styles.homepageHelp}>Kategori görseli yok. Ana sayfa görsel arşivinden yükleyin.</p>:null}
 </div>;
 if(section.kind==="product_row") return <div className={styles.homepageInspectorFields}>
  {heading}<label>Hangi ürünler?<select disabled={disabled} value={section.source} onChange={event=>{
   const source=event.target.value as typeof section.source;
   const {categoryId,productIds,...rest}=section;
   onUpdate({...rest,source,...(source==="category"?{categoryId:categoryId??categories[0]?.resourceId??""}:{}),...(source==="manual"?{productIds:productIds??[],limit:12}: {})});
  }}><option value="latest">Yeni ürünler</option><option value="sale">İndirimli ürünler</option><option value="category">Bir kategori</option><option value="manual">Ürünleri ben seçeyim</option></select></label>
  {section.source==="category"?<label>Kategori<select disabled={disabled} value={section.categoryId??""} aria-invalid={Boolean(errors.categoryId)} aria-describedby={errors.categoryId?"homepage-error-categoryId":undefined} onChange={event=>onUpdate({...section,categoryId:event.target.value})}><option value="">Kategori seçin</option>{categories.map(item=><option key={item.resourceId} value={item.resourceId}>{item.label}</option>)}</select>{error("categoryId")}</label>:null}
  {section.source==="manual"?<ProductPicker destinations={destinations} selectedIds={section.productIds??[]} disabled={disabled} onChange={productIds=>onUpdate({...section,productIds,limit:12})}/>:<label>Ürün sayısı<select disabled={disabled} value={section.limit} onChange={event=>onUpdate({...section,limit:Number(event.target.value) as 4|8|12})}><option value="4">4</option><option value="8">8</option><option value="12">12</option></select></label>}
 </div>;
 if(section.kind==="split_campaign") {
  const updatePanel=(index:number,patch:Partial<StarterCampaignPanelConfig>,remove:readonly ("eyebrow"|"body")[]=[])=>{
   const panels=Array.from({length:Math.max(section.panels.length,index+1)},(_,position)=>section.panels[position]??{heading:"",assetId:"",destination:""});
   panels[index]={...panels[index]!,...patch};for(const key of remove)delete panels[index]![key];onUpdate({...section,panels});
  };
  return <div className={styles.homepageInspectorFields}><p className={styles.homepageHelp}>İki karta başlık, görsel ve bağlantı seçin.</p>{[0,1].map(index=>{
   const panel=section.panels[index];return <fieldset key={index}><legend>{index+1}. kampanya</legend>
    <label>Başlık<input maxLength={160} disabled={disabled} value={panel?.heading??""} aria-invalid={Boolean(errors[`panel${index}Heading`])} aria-describedby={errors[`panel${index}Heading`]?`homepage-error-panel${index}Heading`:undefined} onChange={event=>updatePanel(index,{heading:event.target.value})}/>{error(`panel${index}Heading`)}</label>
    <label>Üst başlık<input maxLength={80} disabled={disabled} value={panel?.eyebrow??""} onChange={event=>updatePanel(index,event.target.value?{eyebrow:event.target.value}:{},event.target.value?[]:["eyebrow"])}/></label>
    <label>Açıklama<textarea maxLength={500} disabled={disabled} value={panel?.body??""} onChange={event=>updatePanel(index,event.target.value?{body:event.target.value}:{},event.target.value?[]:["body"])}/></label>
    <label>Görsel<select disabled={disabled} value={panel?.assetId??""} aria-invalid={Boolean(errors[`panel${index}Asset`])} aria-describedby={errors[`panel${index}Asset`]?`homepage-error-panel${index}Asset`:undefined} onChange={event=>updatePanel(index,{assetId:event.target.value})}><option value="">Görsel seçin</option>{assetOptions(heroAssets,panel?.assetId??"")}</select>{error(`panel${index}Asset`)}</label>
    <label>Bağlantı<select disabled={disabled} value={panel?.destination??""} aria-invalid={Boolean(errors[`panel${index}Destination`])} aria-describedby={errors[`panel${index}Destination`]?`homepage-error-panel${index}Destination`:undefined} onChange={event=>updatePanel(index,{destination:event.target.value})}><option value="">Bağlantı seçin</option>{panel?.destination&&!paths.some(item=>item.path===panel.destination)?<option value={panel.destination}>{panel.destination}</option>:null}{paths.map(item=><option key={item.path} value={item.path}>{item.label}</option>)}</select>{error(`panel${index}Destination`)}</label>
   </fieldset>;
  })}{!heroAssets.length?<p className={styles.homepageHelp}>Kampanya görseli yok. Ana sayfa görsel arşivinden banner yükleyin.</p>:null}</div>;
 }
 if(section.kind==="brand_story") return <div className={styles.homepageInspectorFields}>
  <label>Küçük başlık<input maxLength={80} disabled={disabled} value={section.eyebrow??""} onChange={event=>{const next={...section};if(event.target.value)next.eyebrow=event.target.value;else delete next.eyebrow;onUpdate(next);}}/></label>{heading}
  <label>Hikâye<textarea maxLength={1000} disabled={disabled} value={section.body} aria-invalid={Boolean(errors.body)} aria-describedby={errors.body?"homepage-error-body":undefined} onChange={event=>onUpdate({...section,body:event.target.value})}/>{error("body")}</label>
  <label>Görsel<select disabled={disabled} value={section.assetId??""} onChange={event=>{const next={...section};if(event.target.value)next.assetId=event.target.value;else delete next.assetId;onUpdate(next);}}><option value="">Görselsiz</option>{assetOptions(heroAssets,section.assetId??"")}</select></label>
  <label>Bağlantı<select disabled={disabled} value={section.destination??""} onChange={event=>{const next={...section};if(event.target.value)next.destination=event.target.value;else delete next.destination;onUpdate(next);}}><option value="">Bağlantı yok</option>{section.destination&&!paths.some(item=>item.path===section.destination)?<option value={section.destination}>{section.destination}</option>:null}{paths.map(item=><option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
 </div>;
 if(section.kind==="value_propositions") return <div className={styles.homepageInspectorFields}>{section.items.map((item,index)=><fieldset key={index}><legend>{index+1}. değer</legend><button className={styles.homepageInlineButton} type="button" disabled={disabled||section.items.length<=2} onClick={()=>onUpdate({...section,items:section.items.filter((_,position)=>position!==index)})}><Trash2 size={16}/>Değeri kaldır</button>
  <label>Simge<select disabled={disabled} value={item.icon} onChange={event=>onUpdate({...section,items:section.items.map((entry,position)=>position===index?{...entry,icon:event.target.value as typeof item.icon}:entry)})}>{["sparkles","cotton","heart","shield","truck","return"].map(icon=><option key={icon} value={icon}>{({sparkles:"Öne çıkan",cotton:"Malzeme",heart:"Özen",shield:"Güven",truck:"Teslimat",return:"İade"} as Record<string,string>)[icon]}</option>)}</select></label>
  <label>Başlık<input maxLength={120} disabled={disabled} value={item.heading} aria-invalid={Boolean(errors[`value${index}Heading`])} aria-describedby={errors[`value${index}Heading`]?`homepage-error-value${index}Heading`:undefined} onChange={event=>onUpdate({...section,items:section.items.map((entry,position)=>position===index?{...entry,heading:event.target.value}:entry)})}/>{error(`value${index}Heading`)}</label>
  <label>Açıklama<input maxLength={300} disabled={disabled} value={item.body} aria-invalid={Boolean(errors[`value${index}Body`])} aria-describedby={errors[`value${index}Body`]?`homepage-error-value${index}Body`:undefined} onChange={event=>onUpdate({...section,items:section.items.map((entry,position)=>position===index?{...entry,body:event.target.value}:entry)})}/>{error(`value${index}Body`)}</label>
 </fieldset>)}<button className={styles.homepageInlineButton} type="button" disabled={disabled||section.items.length>=4} onClick={()=>{let number=section.items.length+1;while(section.items.some(item=>item.heading===`Değer ${number}`))number++;onUpdate({...section,items:[...section.items,{icon:"sparkles",heading:`Değer ${number}`,body:"Mağazanızın sunduğu avantajı yazın."}]});}}><Plus size={16}/>Değer ekle · {section.items.length}/4</button><p className={styles.homepageHelp}>2–4 mağaza avantajı gösterilir.</p></div>;
 if(section.kind==="testimonials") return <div className={styles.homepageInspectorFields}>{heading}<label>Yorum sayısı<select disabled={disabled} value={section.limit} onChange={event=>onUpdate({...section,limit:Number(event.target.value) as 3|6|9})}><option value="3">3</option><option value="6">6</option><option value="9">9</option></select></label><label>En düşük puan<select disabled={disabled} value={section.minimumRating} onChange={event=>onUpdate({...section,minimumRating:Number(event.target.value) as 4|5})}><option value="4">4 yıldız</option><option value="5">5 yıldız</option></select></label><p className={styles.homepageHelp}>Mağazanıza ait onaylanmış ürün yorumları gösterilir.</p></div>;
 if(section.kind==="hero") return <div className={styles.homepageInspectorFields}><p className={styles.homepageHelp}>Önceki tasarımın banner kaydı. Bölüm listesinden gizleyebilir veya kaldırabilirsiniz.</p></div>;
 return null;
}
