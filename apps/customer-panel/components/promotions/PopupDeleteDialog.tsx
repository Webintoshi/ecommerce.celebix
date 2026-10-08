"use client";
import {useCallback,useRef,useState,type RefObject} from 'react';
import {DesignSettingsModal} from '../settings/design/DesignSettingsDrawer';
import {StoreEngagementApiError,type PopupDeletionInput, type createStoreEngagementApi} from '../../lib/store-engagement-ui/client';
import type {StoreEngagementDeleteResult} from '@celebix/saas-contracts';

type Props=Readonly<{
 intent:PopupDeletionInput;name?:string;recovery?:boolean;
 api:Pick<ReturnType<typeof createStoreEngagementApi>,'deletePopup'|'hasUnresolved'>;
 returnFocusRef:RefObject<HTMLElement|null>;
 onDeleted:(receipt:StoreEngagementDeleteResult)=>void;onCancel:()=>void;
 onMutationChanged:(busy:boolean)=>void;
}>;
export function PopupDeleteDialog({intent,name,recovery=false,api,returnFocusRef,onDeleted,onCancel,onMutationChanged}:Props){
 const original=useRef(intent),inFlight=useRef(false);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(recovery),[error,setError]=useState('');
 const close=useCallback(()=>{if(!inFlight.current&&!uncertain)onCancel();},[onCancel,uncertain]);
 const apply=async()=>{
  if(inFlight.current)return;
  inFlight.current=true;setBusy(true);setError('');onMutationChanged(true);
  try{const receipt=await api.deletePopup(original.current);setUncertain(false);onDeleted(receipt);}
  catch(reason){
   const unknown=!(reason instanceof StoreEngagementApiError)||['unavailable','operation_mismatch','storage_unavailable','unresolved'].includes(reason.code);
   setUncertain(unknown||api.hasUnresolved());
   setError(reason instanceof StoreEngagementApiError?reason.message:'Silme sonucu doğrulanamadı. Aynı işlemi tekrar deneyin.');
  }finally{inFlight.current=false;setBusy(false);onMutationChanged(false);}
 };
 return <DesignSettingsModal open surface={{label:'Popup sil',hint:'Silinecek popup için onay'}} returnFocusRef={returnFocusRef} onClose={close} onApply={()=>void apply()} applying={busy} applyLabel={uncertain?'Silmeyi doğrula':'Sil'} applyingLabel="Siliniyor…">
  <p>{name?<strong>{name}</strong>:'Bu popup'} silinsin mi?</p>
  <p>Mağazada gösterilmeyecek. Bağlı kupon ve görseller korunur.</p>
  {error?<p role="alert">{error}</p>:null}
  {uncertain&&!error?<p role="status">Önceki silme işleminin sonucunu doğrulayın.</p>:null}
 </DesignSettingsModal>;
}
