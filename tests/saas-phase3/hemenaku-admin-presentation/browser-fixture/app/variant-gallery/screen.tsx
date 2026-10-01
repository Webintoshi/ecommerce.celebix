'use client';
import {useState} from 'react';
import {PanelLayoutClient} from '@/components/panel/PanelLayoutClient';
import {ProductVariantGalleryEditor} from '@/components/catalog/ProductVariantGalleryEditor';
import {VariantGalleryDialog, type VariantGalleryAssignment} from '@/components/catalog/VariantGalleryDialog';
import {MODEL} from '../mira-catalog/catalog-fixture';

const products=['dantel-bluz','antrasit-jean','ekru-triko','mavi-jean','kargo-pantolon','siyah-pantolon'];
const titles=['Dantel detaylı bluz · ön','Antrasit jean · ön','Ekru triko · detay','Mavi jean · arka','Kargo pantolon','Siyah palazzo pantolon'];
const variants=[{id:'s',title:'Ekru / S',attributes:{Renk:'Ekru',Beden:'S'}},{id:'m',title:'Ekru / M',attributes:{Renk:'Ekru',Beden:'M'}},{id:'l',title:'Ekru / L',attributes:{Renk:'Ekru',Beden:'L'}},{id:'xl',title:'Antrasit / XL',attributes:{Renk:'Antrasit',Beden:'XL'}}];
const media=products.map((image,i)=>({id:String(i),url:'/seo-assets/product-'+image+'.webp',altText:titles[i]}));
export function VariantGalleryFixture({scenario}:{scenario:string}) {
 const [assignments,setAssignments]=useState<readonly VariantGalleryAssignment[]>([{variantId:'s',mediaIds:['0','2','3']}]);
 const [open,setOpen]=useState(false);
 const [saved,setSaved]=useState(false);
 return <PanelLayoutClient model={{...MODEL,storeSlug:'mira-variant-fixture',membershipLabel:'QA fixture · canlı değil'}}>
   <main style={{maxWidth:1120}}><h1 className="sr-only">Ürün varyantları</h1><a href="/variant-gallery">← Ürünlere dön</a>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,borderBottom:'1px solid var(--cp-border)',padding:'24px 0'}}><strong>Ekru basic triko</strong><span style={{color:'var(--cp-text-secondary)'}}>Taslak · QA</span></div>
     <h2 style={{fontSize:18,margin:'24px 0 16px'}}>Varyantlar <small>4</small></h2>
     <ProductVariantGalleryEditor media={scenario==='empty'?[]:media} variants={variants} assignments={assignments} onAssignmentsChange={value=>{setAssignments(current=>[...current.filter(a=>!value.some(b=>b.variantId===a.variantId)),...value]);setSaved(true);}} canManage={scenario!=='readonly'}>
       {({thumbnail})=><div>{variants.map(v=><div key={v.id} style={{display:'flex',alignItems:'center',gap:16,padding:'16px 0',borderBottom:'1px solid var(--cp-border)'}}>{thumbnail(v.id)}<strong style={{flex:1}}>{v.title}</strong><span>₺1.490,00</span><span>20 adet</span></div>)}</div>}
     </ProductVariantGalleryEditor>
     {saved?<p role="status">Galeri uygulandı.</p>:null}
     {['error','busy'].includes(scenario)?<button type="button" className="button button-secondary" style={{marginTop:24}} onClick={()=>setOpen(true)}>Galeri durumunu aç</button>:null}
     {open?<VariantGalleryDialog variant={variants[0]} variants={variants} media={media} selectedIds={['0','2','3']} onClose={()=>setOpen(false)} onApply={async()=>{await new Promise(resolve=>setTimeout(resolve,scenario==='busy'?4000:120));if(scenario==='error')throw new Error('Görseller kaydedilemedi. Seçiminiz korunuyor; tekrar deneyin.');setOpen(false);}} />:null}
   </main>
 </PanelLayoutClient>;
}
