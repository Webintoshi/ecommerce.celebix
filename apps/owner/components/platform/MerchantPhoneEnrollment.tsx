'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {normalizeStorefrontAccountPhone} from '../../../storefront-shared/lib/account/phone.ts';
import styles from './MerchantPhoneEnrollment.module.css';
type EnrollmentResult=Readonly<{code:'ok';phoneMasked:string;phoneVerified:boolean}>;
class EnrollmentFailure extends Error{constructor(readonly uncertain=false){super('Telefon tanımlanamadı. Bilgileriniz korunuyor; aynı işlemle yeniden deneyebilirsiniz.');}}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function MerchantPhoneEnrollment({principalId,displayName,disabled=false,fetcher=fetch,onSaved}:Readonly<{principalId:string;displayName:string;disabled?:boolean;fetcher?:typeof fetch;onSaved?:()=>void}>){
 const [open,setOpen]=useState(false),[phone,setPhone]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[result,setResult]=useState<EnrollmentResult|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),phoneInput=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null),pending=useRef(false),mounted=useRef(false),attempt=useRef<{fingerprint:string;operationId:string}|null>(null),titleId=useId(),descriptionId=useId();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(open){dialog.current?.showModal();phoneInput.current?.focus();}else dialog.current?.close();},[open]);
 function show(){if(disabled||pending.current)return;setPhone('');setReason('');setConfirmed(false);setError(null);setUncertain(false);attempt.current=null;setOpen(true);}
 function close(){if(pending.current||uncertain)return;setOpen(false);setPhone('');setReason('');setConfirmed(false);setError(null);queueMicrotask(()=>trigger.current?.focus());}
 async function apply(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(disabled||pending.current)return;let normalized:string,auditReason:string;
  try{normalized=normalizeStorefrontAccountPhone(phone);auditReason=reason.trim();if(!UUID.test(principalId)||auditReason.length<20||auditReason.length>500||/[\u0000-\u001f\u007f]/.test(auditReason)||!confirmed)throw Error();}catch{setError('Kişisel telefonu, en az 20 karakterlik gerekçeyi ve hesap onayını kontrol edin.');return;}
  const fingerprint=JSON.stringify([principalId,normalized,auditReason]);if(attempt.current?.fingerprint!==fingerprint)attempt.current={fingerprint,operationId:crypto.randomUUID()};const operationId=attempt.current.operationId;
  pending.current=true;setBusy(true);setError(null);
  try{
   let response:Response;try{response=await fetcher('/api/security/merchant-phone/enroll',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{accept:'application/json','content-type':'application/json','idempotency-key':operationId,'x-celebix-csrf':'merchant-phone-enroll-v1'},body:JSON.stringify({principalId,phone:normalized,reason:auditReason,operationId})});}catch{throw new EnrollmentFailure(true);}
   const body=await response.json().catch(()=>null);if(!response.ok)throw new EnrollmentFailure(response.status>=500);if(!body||Object.keys(body).sort().join(',')!=='code,phoneMasked,phoneVerified'||body.code!=='ok'||typeof body.phoneMasked!=='string'||!body.phoneMasked||body.phoneMasked.length>80||typeof body.phoneVerified!=='boolean')throw new EnrollmentFailure(true);
   if(mounted.current){setResult(body);setOpen(false);setPhone('');setReason('');setConfirmed(false);setUncertain(false);attempt.current=null;queueMicrotask(()=>trigger.current?.focus());onSaved?.();}
  }catch(failure){if(mounted.current){setError(failure instanceof EnrollmentFailure?failure.message:'Telefon tanımlanamadı. Bilgileriniz korunuyor; yeniden deneyin.');setUncertain(failure instanceof EnrollmentFailure&&failure.uncertain);}}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 function keyboard(event:React.KeyboardEvent<HTMLDialogElement>){if(event.key!=='Tab')return;const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')),first=controls[0],last=controls.at(-1);if(first&&last&&(event.shiftKey&&document.activeElement===first||!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first).focus();}}
 return <div className={styles.control}>
  <button ref={trigger} type="button" className="platform-button" data-enroll-phone disabled={disabled||busy} onClick={show}>WhatsApp giriş telefonu</button>
  {result&&<p className={styles.status} role="status">{result.phoneMasked} · {result.phoneVerified?'Doğrulandı':'Hesap sahibi WhatsApp koduyla doğrulayacak.'}</p>}
  <dialog ref={dialog} className={`platform-dialog ${styles.dialog}`} aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={keyboard} onCancel={event=>{event.preventDefault();close();}}>
   {open&&<form onSubmit={event=>void apply(event)} className={styles.form}>
    <header><h2 id={titleId}>WhatsApp giriş telefonu</h2><p id={descriptionId}>{displayName} için kişisel giriş telefonunu tanımlayın.</p></header>
    <label className="platform-field"><span>Kişisel telefon numarası</span><input ref={phoneInput} name="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0555 111 22 33" maxLength={64} required disabled={busy||uncertain} value={phone} onChange={event=>setPhone(event.target.value)}/></label>
    <label className="platform-field"><span>Tanımlama gerekçesi</span><textarea name="reason" minLength={20} maxLength={500} rows={3} required disabled={busy||uncertain} value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <p className={styles.warning}>Telefon değiştirilirse mevcut giriş oturumları kapatılır.</p>
    <label className="platform-check"><input name="confirm-account" type="checkbox" required disabled={busy||uncertain} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>Telefonun seçilen kişiye ait olduğunu doğruladım. Tanımlanan kişi WhatsApp koduyla kendi hesabına girecek.</span></label>
    {error&&<p className={styles.error} role="alert">{error}</p>}{uncertain&&<p>Aynı işlemle yeniden deneyin. Sonuç doğrulanana kadar taslak korunur.</p>}
    <footer className={styles.footer}><button type="button" className="platform-button" disabled={busy||uncertain} onClick={close}>Vazgeç</button><button type="submit" className="platform-button is-primary" disabled={busy||!confirmed}>{busy?'Kaydediliyor…':uncertain?'Aynı işlemi yeniden dene':'Telefonu tanımla'}</button></footer>
   </form>}
  </dialog>
 </div>;
}
