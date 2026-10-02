"use client";
import { ChevronDown,ChevronUp,Copy,Eye,EyeOff,GripVertical,Plus,RotateCcw,Trash2 } from "lucide-react";
import { useMemo,useRef,useState } from "react";
import { normalizeStarterThemeCompositionV4,type HomepageSectionId,type StarterThemeCompositionConfigV4,type StarterThemeSectionConfigV4,type StorefrontDesignAssetOption,type StorefrontDesignDestinationOption,type StorefrontDesignDocument,type StorefrontDesignEditorMediaOption,type StorefrontDesignMediaOption,type StorefrontAsset } from "@celebix/saas-contracts";
import { addHomepageSection,duplicateHomepageSection,moveHomepageSection,removeHomepageSection,restoreRemovedHomepageSection,setHomepageSectionVisibility,updateHomepageSection,type HomepageUndo } from "./homepage-command-model";
import { HomepageSectionFields,sectionFieldErrors } from "./HomepageSectionFields";
import {scoreHomepageQuality} from "./homepage-quality-model";
import styles from "../design-settings.module.css";
export const SECTION_LIBRARY=Object.freeze([
 {kind:"banner",label:"Banner",hint:"Tek görsel, slayt veya alt alta bannerlar."},
 {kind:"category_grid",label:"Kategori vitrini",hint:"Kendi seçtiğiniz kategorileri gösterin."},
 {kind:"product_row",label:"Ürün bölümü",hint:"Yeni, indirimli, kategori veya seçili ürünler."},
 {kind:"split_campaign",label:"İkili kampanya",hint:"Yan yana iki görsel bağlantı."},
 {kind:"brand_story",label:"Marka hikâyesi",hint:"Mağazanızı metin ve görselle anlatın."},
 {kind:"value_propositions",label:"Değer önerileri",hint:"Teslimat, güven ve iade vaatleri."},
 {kind:"testimonials",label:"Müşteri yorumları",hint:"Onaylanmış ürün yorumları."},
] satisfies readonly Readonly<{kind:StarterThemeSectionConfigV4["kind"];label:string;hint:string}>[]);
export const SECTION_LABEL=Object.freeze(Object.fromEntries(SECTION_LIBRARY.map(item=>[item.kind,item.label])) as Record<StarterThemeSectionConfigV4["kind"],string>);
function editableComposition(design:StorefrontDesignDocument):StarterThemeCompositionConfigV4{return design.composition.schemaVersion===4?design.composition as StarterThemeCompositionConfigV4:normalizeStarterThemeCompositionV4(design.composition);}
export function nextSectionId(kind:StarterThemeSectionConfigV4["kind"]):HomepageSectionId{return `home_${kind}_${globalThis.crypto.randomUUID().replaceAll("-","_")}` as HomepageSectionId;}
export function sectionSummary(section:StarterThemeSectionConfigV4):string {
 if(section.kind==="banner")return `${section.slides.length} görsel · ${{single:"Tek banner",slider:"Slayt",stacked:"Alt alta"}[section.layout]}`;
 if(section.kind==="category_grid")return `${section.categoryIds.length} kategori`;
 if(section.kind==="product_row")return section.source==="manual"?`${section.productIds?.length??0} seçili ürün`:`${section.limit} ürün · ${{latest:"Yeni",sale:"İndirimli",category:"Kategori"}[section.source]}`;
 if(section.kind==="split_campaign")return `${section.panels.length} kampanya`;
 if(section.kind==="value_propositions")return `${section.items.length} değer`;
 return section.heading;
}
export function HomepageSectionLibrary({onSelect,disabled=false}:Readonly<{onSelect:(kind:StarterThemeSectionConfigV4["kind"])=>void;disabled?:boolean}>){return <div className={styles.sectionLibrary}>{SECTION_LIBRARY.map(item=><button type="button" key={item.kind} disabled={disabled} onClick={()=>onSelect(item.kind)}><Plus size={18}/><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}</div>;}
export function HomepageSectionEditor({design,sectionId,media,assets=[],destinations,disabled,onChange,onSelectSection,onUpload,onAssetUploaded,onMediaBusyChange}:Readonly<{design:StorefrontDesignDocument;sectionId:HomepageSectionId;media:readonly StorefrontDesignEditorMediaOption[];assets?:readonly StorefrontDesignAssetOption[];destinations:readonly StorefrontDesignDestinationOption[];disabled:boolean;onChange:(design:StorefrontDesignDocument)=>void;onSelectSection:(id:HomepageSectionId)=>void;onUpload?:(file:File,altText:string)=>Promise<StorefrontDesignMediaOption>;onAssetUploaded?:(asset:StorefrontAsset)=>void;onMediaBusyChange?:(id:string,busy:boolean)=>void}>){
 const latest=useRef(design);latest.current=design;
 const [tab,setTab]=useState<"content"|"appearance">("content");const composition=editableComposition(design),section=composition.sections.find(item=>item.sectionId===sectionId);
 if(!section)return <p role="status">Bölüm kaldırıldı. Değişikliği uygulayabilir veya vazgeçebilirsiniz.</p>;
 const change=(next:StarterThemeSectionConfigV4)=>{const current=latest.current,currentComposition=editableComposition(current);onChange({...current,composition:{...currentComposition,sections:currentComposition.sections.map(item=>item.sectionId===section.sectionId?next:item)}});};
 const style=section.style??{background:"theme",width:"contained",spacing:"normal"};
 return <div className={styles.sectionEditor}>
  <div className={styles.sectionTabs} role="tablist" aria-label="Bölüm ayarları" onKeyDown={event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();const next=tab==="content"?"appearance":"content";setTab(next);event.currentTarget.querySelector<HTMLButtonElement>(`#section-${next}-${sectionId}`)?.focus();}}}><button type="button" id={`section-content-${sectionId}`} aria-controls={`section-panel-${sectionId}`} role="tab" aria-selected={tab==="content"} onClick={()=>setTab("content")}>İçerik</button><button type="button" id={`section-appearance-${sectionId}`} aria-controls={`section-panel-${sectionId}`} role="tab" aria-selected={tab==="appearance"} onClick={()=>setTab("appearance")}>Görünüm</button></div>
  <div id={`section-panel-${sectionId}`} aria-labelledby={`section-${tab}-${sectionId}`} role="tabpanel" aria-label={tab==="content"?"İçerik":"Görünüm"}>
   {tab==="content"?<HomepageSectionFields section={section} media={media} assets={assets} destinations={destinations} disabled={disabled} errors={sectionFieldErrors(section)} onUpdate={change} onUpload={onUpload} onMediaBusyChange={onMediaBusyChange} onAssetUploaded={onAssetUploaded}/>:<div className={styles.homepageInspectorFields}>
    <label>Arka plan<select disabled={disabled} value={style.background} onChange={event=>change({...section,style:{...style,background:event.target.value as typeof style.background}})}>{[["theme","Tema"],["light","Açık"],["dark","Koyu"],["brand","Marka rengi"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Genişlik<select disabled={disabled} value={style.width} onChange={event=>change({...section,style:{...style,width:event.target.value as typeof style.width}})}><option value="contained">İçerik genişliği</option><option value="full">Tam genişlik</option></select></label>
    <label>Dikey boşluk<select disabled={disabled} value={style.spacing} onChange={event=>change({...section,style:{...style,spacing:event.target.value as typeof style.spacing}})}><option value="small">Küçük</option><option value="normal">Normal</option><option value="large">Büyük</option></select></label>
    {section.style?<button type="button" disabled={disabled} onClick={()=>{const {style:_style,...next}=section;change(next);}}>Tema görünümüne dön</button>:null}
   </div>}
  </div>
  <div className={styles.sectionManagement}>
   <button type="button" disabled={disabled} onClick={()=>onChange({...design,composition:setHomepageSectionVisibility(composition,sectionId,!section.enabled)})}>{section.enabled?<Eye size={16}/>:<EyeOff size={16}/>} {section.enabled?"Gizle":"Göster"}</button>
   <button type="button" disabled={disabled} onClick={()=>{const id=nextSectionId(section.kind);onChange({...design,composition:duplicateHomepageSection(composition,sectionId,id)});onSelectSection(id);}}><Copy size={16}/>Çoğalt</button>
   <button type="button" disabled={disabled} onClick={()=>onChange({...design,composition:removeHomepageSection(composition,sectionId).composition})}><Trash2 size={16}/>Kaldır</button>
  </div>
 </div>;
}
export function HomepageBuilder({design,canManage,onChange,onSelectSection,media=[],assets=[],destinations=[]}:Readonly<{design:StorefrontDesignDocument;canManage:boolean;onChange:(design:StorefrontDesignDocument)=>void;onSelectSection?:(id:HomepageSectionId)=>void;media?:readonly StorefrontDesignEditorMediaOption[];assets?:readonly StorefrontDesignAssetOption[];destinations?:readonly StorefrontDesignDestinationOption[];previewMode?:"desktop"|"mobile"}>){
 const composition=editableComposition(design),draggedId=useRef<HomepageSectionId|null>(null);const [undo,setUndo]=useState<HomepageUndo|null>(null);
 const quality=useMemo(()=>{try{return scoreHomepageQuality({design,media,assets,destinations});}catch{return null;}},[design,media,assets,destinations]);
 const change=(next:typeof composition)=>onChange({...design,composition:next});
 return <section className={styles.homepageBuilder} aria-label="Bölüm sıralaması">{quality?<section className={styles.homepageQuality} aria-label="Ana sayfa kalite puanı"><div className={styles.homepageScore}><strong>{quality.score}</strong><span>/ 100</span></div><div><h3>{quality.label}</h3><p>{quality.recommendations[0]?.message??"Ana sayfa hazır."}</p></div><progress max="100" value={quality.score}>{quality.score}</progress></section>:null}<p className={styles.homepageHelp}>Bölümleri sürükleyin veya oklarla taşıyın. Üst alan ve footer sabit kalır.</p><ol className={styles.homepageSectionList}>{composition.sections.map((section,index)=><li key={section.sectionId} draggable={canManage} onDragStart={()=>{draggedId.current=section.sectionId;}} onDragEnd={()=>{draggedId.current=null;}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(draggedId.current)change(moveHomepageSection(composition,draggedId.current,index));draggedId.current=null;}} className={!section.enabled?styles.homepageSectionDisabled:undefined}>
  <div className={styles.homepageSectionMain}><GripVertical size={18} aria-hidden="true"/><span>{index+1}</span><div><b>{SECTION_LABEL[section.kind]}</b><small>{sectionSummary(section)}{!section.enabled?" · Gizli":""}</small></div></div><div className={styles.homepageSectionActions}>
   <button type="button" disabled={!canManage||index===0} aria-label={`${SECTION_LABEL[section.kind]} ${index+1} yukarı taşı`} onClick={()=>change(moveHomepageSection(composition,section.sectionId,index-1))}><ChevronUp size={17}/></button>
   <button type="button" disabled={!canManage||index===composition.sections.length-1} aria-label={`${SECTION_LABEL[section.kind]} ${index+1} aşağı taşı`} onClick={()=>change(moveHomepageSection(composition,section.sectionId,index+1))}><ChevronDown size={17}/></button>
   <button type="button" disabled={!canManage} aria-label={`${SECTION_LABEL[section.kind]} ${index+1} ${section.enabled?"gizle":"göster"}`} onClick={()=>change(setHomepageSectionVisibility(composition,section.sectionId,!section.enabled))}>{section.enabled?<Eye size={17}/>:<EyeOff size={17}/>}</button>
   <button type="button" disabled={!canManage} aria-label={`${SECTION_LABEL[section.kind]} ${index+1} çoğalt`} onClick={()=>change(duplicateHomepageSection(composition,section.sectionId,nextSectionId(section.kind)))}><Copy size={17}/></button>
   <button type="button" disabled={!canManage} aria-label={`${SECTION_LABEL[section.kind]} ${index+1} kaldır`} onClick={()=>{const result=removeHomepageSection(composition,section.sectionId);setUndo(result.undo);change(result.composition);}}><Trash2 size={17}/></button>
  </div>
 </li>)}</ol>{!composition.sections.length?<p>Ana sayfa boş. Önizlemedeki ekleme noktasından bir bölüm seçin.</p>:null}{undo?<button type="button" className={styles.homepageUndo} disabled={!canManage} onClick={()=>{change(restoreRemovedHomepageSection(composition,undo));setUndo(null);}}><RotateCcw size={16}/>Kaldırılan bölümü geri getir</button>:null}</section>;
}
