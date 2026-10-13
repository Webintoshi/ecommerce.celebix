'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Button} from './ui';
import type {Store} from './types';

type Invitation=NonNullable<Store['invitations']>[number];
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TOKEN=/^[a-f0-9-]{72}$/;
function safeLink(value:unknown,host:string|undefined):string {
 if(typeof value!=='string'||!host)throw Error();
 const url=new URL(value),token=url.pathname.slice('/invitations/'.length);
 if(url.protocol!=='https:'||url.hostname!==host||url.port||url.username||url.password||url.search||url.hash||url.pathname!==`/invitations/${token}`||!TOKEN.test(token))throw Error();
 return url.toString();
}
export function InvitationRecovery({storeId,invitation,disabled=false,fetcher=fetch}:{storeId:string;invitation:Invitation;disabled?:boolean;fetcher?:typeof fetch}) {
 const [open,setOpen]=useState(false),[operationId,setOperationId]=useState(''),[expectedVersion,setExpectedVersion]=useState(''),[includeTargetPrincipal,setIncludeTargetPrincipal]=useState(Boolean(invitation.targetPrincipalId)),[error,setError]=useState<string|null>(null),[url,setUrl]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),inFlight=useRef(false),titleId=useId(),noteId=useId();
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 const eligible=!disabled&&invitation.kind==='invite'&&!invitation.acceptedAt&&Number.isFinite(Date.parse(invitation.expiresAt??''))&&Date.parse(invitation.expiresAt!)>Date.now()&&Boolean(invitation.targetPrincipalId&&invitation.adminHost);
 if(!eligible)return null;
 function close(){if(inFlight.current)return;setOpen(false);setError(null);setUrl(null);}
 async function recover(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(inFlight.current)return;
  if(!UUID.test(operationId)||!/^\d+$/.test(expectedVersion)||!Number.isSafeInteger(Number(expectedVersion))||Number(expectedVersion)>=Number.MAX_SAFE_INTEGER){setError('Özgün işlem kimliğini ve sürümünü kontrol edin.');return;}
  inFlight.current=true;setBusy(true);setError(null);setUrl(null);
  try {
   const response=await fetcher('/api/platform/invitations/recover',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeId,invitationId:invitation.id,operationId,expectedVersion:Number(expectedVersion),includeTargetPrincipal})});
   if(!response.ok){setError(response.status===401||response.status===403?'Owner oturumunu ve iki aşamalı doğrulamayı kontrol edin.':'Bağlantı alınamadı. Özgün işlem bilgilerini kontrol ederek aynı işlemle yeniden deneyin.');return;}
   const result=await response.json();if(result?.code!=='ok'||result.invitationId!==invitation.id||Object.keys(result).sort().join(',')!=='code,invitationId,url')throw Error();
   setUrl(safeLink(result.url,invitation.adminHost));
  }catch{setError('Bağlantı alınamadı. Özgün işlem bilgileri korunuyor; aynı işlemle yeniden deneyin.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <>
  <button type="button" className="platform-button" data-recover-invitation onClick={()=>setOpen(true)}>Bağlantıyı kurtar</button>
  <dialog ref={dialog} className="platform-dialog" aria-labelledby={titleId} aria-describedby={noteId} onCancel={event=>{event.preventDefault();close();}}>
   {open&&<form onSubmit={event=>void recover(event)}>
    <div className="platform-dialog-heading"><h2 id={titleId}>Davet bağlantısını kurtar</h2><p id={noteId}>Daveti oluşturan Owner hesabıyla özgün işlem bilgilerini girin. Yeni davet veya erişim oluşturulmaz.</p></div>
    {url?<div className="platform-notice"><label>Davet bağlantısı<input className="platform-copy-input" aria-label="Davet bağlantısı" readOnly value={url} onFocus={event=>event.target.select()}/></label><Button onClick={()=>void navigator.clipboard.writeText(url).catch(()=>setError('Bağlantıyı seçip kopyalayabilirsiniz.'))}>Bağlantıyı kopyala</Button><a className="platform-button" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Daveti aç</a></div>:<div className="platform-dialog-fields">
     <label className="platform-field"><span>Özgün işlem kimliği *</span><input autoFocus name="operationId" required value={operationId} disabled={busy} onChange={event=>setOperationId(event.target.value)} autoComplete="off"/></label>
     <label className="platform-field"><span>Özgün kayıt sürümü *</span><input name="expectedVersion" type="number" min="0" step="1" required value={expectedVersion} disabled={busy} onChange={event=>setExpectedVersion(event.target.value)}/></label>
     <label className="platform-check"><input name="includeTargetPrincipal" type="checkbox" checked={includeTargetPrincipal} disabled={busy} onChange={event=>setIncludeTargetPrincipal(event.target.checked)}/><span>Daveti oluştururken doğrulanmış hesabı seçtim.</span></label>
    </div>}
    {error&&<div className="platform-notice is-error" role="alert">{error}</div>}
    <div className="platform-dialog-footer"><Button onClick={close} disabled={busy}>Kapat</Button>{!url&&<Button type="submit" primary disabled={busy}>{busy?'Bağlantı alınıyor…':'Bağlantıyı getir'}</Button>}</div>
   </form>}
  </dialog>
 </>;
}
