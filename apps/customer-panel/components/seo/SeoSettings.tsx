'use client';

import Link from 'next/link';
import {Globe,Image as ImageIcon,ShieldCheck,Send,ExternalLink} from 'lucide-react';
import {useCallback,useEffect,useRef,useState,type ChangeEvent,type FormEvent} from 'react';
import {parseSaveSeoSettingsRequest,type SeoSettings as Settings,type StorefrontAsset} from '@celebix/saas-contracts';
import {SeoApiError,seoClient,type SeoClient} from '@/lib/seo-ui/client';
import {mutationIdentity,nullable,type MutationIdentity} from '@/lib/seo-ui/model';
import {useSeoUnsavedChanges} from '@/lib/seo-ui/unsaved';
import {SeoArtwork,SeoFeedback,SeoFrame,SeoLoading} from './SeoShared';
import styles from './seo.module.css';

type TextField='metaTitle'|'metaDescription'|'socialTitle'|'socialDescription'|'googleVerification'|'bingVerification';
const byteCount=(value:string)=>new TextEncoder().encode(value).length;
function payloadFor(draft:Settings,version:number){return{expectedVersion:version,metaTitle:nullable(draft.metaTitle),metaDescription:nullable(draft.metaDescription),allowIndex:draft.allowIndex,socialTitle:nullable(draft.socialTitle),socialDescription:nullable(draft.socialDescription),socialAssetId:draft.socialAssetId,googleVerification:nullable(draft.googleVerification),bingVerification:nullable(draft.bingVerification),indexNowEnabled:draft.indexNowEnabled};}

export function SeoSettings({canManage,client=seoClient}:Readonly<{canManage:boolean;client?:SeoClient}>){
  const [settings,setSettings]=useState<Settings|null>(null),[draft,setDraft]=useState<Settings|null>(null),[assets,setAssets]=useState<readonly StorefrontAsset[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[assetError,setAssetError]=useState(''),[message,setMessage]=useState(''),[conflict,setConflict]=useState(false);
  const [fieldErrors,setFieldErrors]=useState<Partial<Record<TextField,string>>>({});
  const pending=useRef<MutationIdentity|null>(null),keepButton=useRef<HTMLButtonElement>(null),form=useRef<HTMLFormElement>(null);
  const dirty=canManage&&!!draft&&!!settings&&JSON.stringify(payloadFor(draft,settings.version))!==JSON.stringify(payloadFor(settings,settings.version));
  const unsaved=useSeoUnsavedChanges(dirty);
  const disabled=!canManage||busy||unsaved.confirming;

  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try{const current=await client.settings();setSettings(current);setDraft(current);setConflict(false);setFieldErrors({});pending.current=null;unsaved.reset();}
    catch(error){setError(error instanceof Error?error.message:'Ayarlar yüklenemedi.');}
    finally{setBusy(false);}
  },[client,unsaved.reset]);
  const loadAssets=useCallback(async()=>{
    try{setAssets((await client.assets()).filter(asset=>asset.kind==='social'&&asset.status==='active'));setAssetError('');}
    catch{setAssetError('Görsel arşivi yüklenemedi. Mevcut görsel seçiminiz korunuyor.');}
  },[client]);
  useEffect(()=>{void load();void loadAssets();},[load,loadAssets]);
  useEffect(()=>{if(unsaved.confirming)keepButton.current?.focus();},[unsaved.confirming]);
  function change<K extends keyof Settings>(key:K,value:Settings[K]){
    setDraft(current=>current?{...current,[key]:value}:current);setMessage('');setFieldErrors(current=>({...current,[key]:undefined}));
  }
  function validate(){
    if(!draft)return false;
    const errors:Partial<Record<TextField,string>>={};
    for(const key of ['metaTitle','metaDescription','socialTitle','socialDescription']as const){const limit=key.endsWith('Description')?500:160;if(byteCount(draft[key]?.trim()??'')>limit)errors[key]=`En fazla ${limit} byte girin.`;}
    for(const key of ['googleVerification','bingVerification']as const){const value=draft[key]?.trim();if(value&&(value.length>256||!/^[a-zA-Z0-9_-]+$/.test(value)))errors[key]='Yalnızca doğrulama kodu girin: harf, rakam, _ veya -.';}
    setFieldErrors(errors);
    if(Object.keys(errors).length){setError('Alanları kontrol edin.');const name=Object.keys(errors)[0];form.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();return false;}
    return true;
  }
  async function save(event:FormEvent){
    event.preventDefault();if(!draft||!settings||busy||!canManage||conflict||unsaved.confirming||!validate())return;
    const payload=payloadFor(draft,settings.version);
    try{parseSaveSeoSettingsRequest(payload);}catch{setError('Alanları kontrol edin.');return;}
    pending.current=mutationIdentity(pending.current,'settings',payload);setBusy(true);setError('');
    try{const result=await client.saveSettings(payload,pending.current.key);setSettings(result.settings);setDraft(result.settings);pending.current=null;unsaved.reset();setMessage('SEO ayarları kaydedildi.');}
    catch(error){setError(error instanceof Error?error.message:'Ayarlar kaydedilemedi.');setConflict(error instanceof SeoApiError&&error.code==='version_conflict');}
    finally{setBusy(false);}
  }
  function cancel(){
    if(busy)return;unsaved.requestDiscard(()=>{setDraft(settings);setFieldErrors({});setError('');setMessage('');pending.current=null;});
  }
  function text(key:TextField,label:string,multiline=false){
    const verification=key.endsWith('Verification'),limit=verification?256:multiline?500:160,value=draft?.[key]??'',hintId=`seo-${key}-hint`;
    const props={name:key,disabled,maxLength:limit,value,'aria-invalid':!!fieldErrors[key],'aria-describedby':hintId,onChange:(event:ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>change(key,event.target.value)};
    return <label>{label}{multiline?<textarea {...props} rows={3}/>:<input {...props} autoComplete="off"/>}<small id={hintId} className={styles.countHint}>{verification?value.length:byteCount(value)}/{limit} {verification?'karakter':'byte'}</small>{fieldErrors[key]?<small role="alert" className={styles.error}>{fieldErrors[key]}</small>:null}</label>;
  }
  const image=assets.find(asset=>asset.id===draft?.socialAssetId)?.publicUrl??(draft?.socialAssetId===settings?.socialAssetId?settings?.socialImageUrl:null);
  const imageAlt=assets.find(asset=>asset.id===draft?.socialAssetId)?.altText||'Seçilen sosyal paylaşım görseli';

  return <SeoFrame active="settings" title="SEO ayarları" canManage={canManage}>
    <SeoFeedback error={error} message={message}/>
    {!draft?busy?<SeoLoading label="Ayarlar yükleniyor…"/>:<div className={styles.empty}><SeoArtwork kind="search"/><strong>Ayarlar yüklenemedi</strong><button type="button" onClick={()=>void load()}>Yeniden dene</button></div>:<form ref={form} className={styles.form} onSubmit={save}>
      <section className={styles.settingsSection} aria-labelledby="seo-default-label"><div className={styles.sectionIntro}><Globe size={22} aria-hidden="true"/><div><h2 id="seo-default-label">Mağaza varsayılanları</h2><small>Özel meta alanı olmayan içeriklerde kullanılır.</small></div></div><div className={styles.sectionBody}>
        {text('metaTitle','Meta başlık')}{text('metaDescription','Meta açıklama',true)}
        <label className={styles.checkbox}><input type="checkbox" name="allowIndex" disabled={disabled} checked={draft.allowIndex} onChange={event=>change('allowIndex',event.target.checked)}/>Arama motorları indeksleyebilir</label><small className={styles.muted}>İçeriklerin kendi tercihi ayrıca uygulanır.</small>
      </div></section>
      <section className={styles.settingsSection} aria-labelledby="seo-social-label"><div className={styles.sectionIntro}><ImageIcon size={22} aria-hidden="true"/><div><h2 id="seo-social-label">Sosyal paylaşım</h2><small>Mağaza adresiniz paylaşıldığında.</small></div></div><div className={styles.sectionBody}><div className={styles.fieldPair}><div className={styles.form}>
        {text('socialTitle','Paylaşım başlığı')}{text('socialDescription','Paylaşım açıklaması',true)}
        <label>Paylaşım görseli<select name="socialAssetId" disabled={disabled} value={draft.socialAssetId??''} onChange={event=>change('socialAssetId',event.target.value||null)}><option value="">Varsayılan görsel</option>{draft.socialAssetId&&!assets.some(asset=>asset.id===draft.socialAssetId)?<option value={draft.socialAssetId}>Mevcut paylaşım görseli</option>:null}{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.altText||'Paylaşım görseli'} · {asset.width}×{asset.height}</option>)}</select></label>
        {assetError?<><p className={styles.error} role="alert">{assetError}</p><button type="button" disabled={busy||unsaved.confirming} onClick={()=>void loadAssets()}>Görselleri yeniden yükle</button></>:null}
        <Link className={styles.textLink} href="/settings/design?step=identity">Görsel arşivini yönet <ExternalLink size={14} aria-hidden="true"/></Link>
      </div><section className={styles.socialPreview} aria-label="Paylaşım önizlemesi">
        {image?<img src={image} alt={imageAlt}/>:<div className={styles.socialPlaceholder}><ImageIcon size={28} aria-hidden="true"/><span>Varsayılan görsel</span></div>}
        <div><small>{draft.hostname||'Mağaza adresi'}</small><strong>{draft.socialTitle||draft.metaTitle||''}</strong><p>{draft.socialDescription||draft.metaDescription||''}</p></div>
      </section></div></div></section>
      <section className={styles.settingsSection} aria-labelledby="seo-verification-label"><div className={styles.sectionIntro}><ShieldCheck size={22} aria-hidden="true"/><div><h2 id="seo-verification-label">Doğrulama kodları</h2><small>HTML etiketi yerine yalnızca kod.</small></div></div><div className={styles.sectionBody}><div className={styles.fieldPair}>
        {text('googleVerification','Google doğrulama kodu')}{text('bingVerification','Bing doğrulama kodu')}
      </div><small className={styles.muted}>Kod eklemek, doğrulamanın tamamlandığı anlamına gelmez.</small></div></section>
      <section className={styles.settingsSection} aria-labelledby="seo-indexnow-label"><div className={styles.sectionIntro}><Send size={22} aria-hidden="true"/><div><h2 id="seo-indexnow-label">IndexNow</h2><small>URL değişikliklerini bildirin.</small></div></div><div className={styles.sectionBody}>
        <label className={styles.checkbox}><input type="checkbox" name="indexNowEnabled" disabled={disabled} checked={draft.indexNowEnabled} onChange={event=>change('indexNowEnabled',event.target.checked)}/>Otomatik bildirim</label>
        <span className={`${styles.statusBadge} ${draft.eligible?'':styles.closed}`} data-tone={draft.eligible?'success':'neutral'}>{draft.eligible&&draft.hostname?`Bildirim alanı: ${draft.hostname}`:'Doğrulanmış birincil alan adı gerekiyor'}</span>
        <small className={styles.muted}>Bildirimler indekslenme garantisi vermez. Google bu kanalı kullanmaz.</small><Link className={styles.textLink} href="/seo?tab=notifications">Bildirimleri görüntüle <ExternalLink size={14} aria-hidden="true"/></Link>
      </div></section>
      <div className={styles.settingsFooter}>
        {unsaved.confirming?<div className={styles.inlineDiscard} role="alert"><strong>Kaydedilmemiş değişiklikler var.</strong><p>Değişiklikleri bırakmak istiyor musunuz?</p><div className={styles.actions}><button ref={keepButton} type="button" disabled={busy} onClick={unsaved.cancelDiscard}>Düzenlemeye devam et</button><button type="button" disabled={busy} onClick={unsaved.confirmDiscard}>Değişiklikleri bırak</button></div></div>:<>
          <small className={styles.muted} role="status">{dirty?'Kaydedilmemiş değişiklikler':message?'Değişiklikler kaydedildi':'Değişiklik yok'}</small><div className={styles.actions}>{conflict?<button id="seo-settings-reload" type="button" disabled={busy} onClick={()=>unsaved.requestDiscard(load)}>Güncel ayarları yükle</button>:<button id="seo-settings-cancel" type="button" disabled={busy||!canManage} onClick={cancel}>Vazgeç</button>}<button type="submit" className={styles.primary} disabled={busy||conflict||!canManage}>{busy?'Kaydediliyor…':'Kaydet'}</button></div>
        </>}
      </div>
    </form>}
  </SeoFrame>;
}
