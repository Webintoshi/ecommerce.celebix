"use client";
import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import type { DesignCanvasSurfaceItem, DesignCanvasTrigger } from "./design-surface-model";
import styles from "../design-settings.module.css";
interface DesignSettingsModalProps {
 readonly open:boolean; readonly surface:Pick<DesignCanvasSurfaceItem,"label"|"hint">; readonly children:ReactNode;
 readonly onClose:()=>void; readonly onApply?:()=>void; readonly applying?:boolean; readonly applyDisabled?:boolean;
 readonly returnFocusRef:RefObject<DesignCanvasTrigger|null>;
}
export function DesignSettingsModal({open,surface,children,onClose,onApply,applying=false,applyDisabled=false,returnFocusRef}:Readonly<DesignSettingsModalProps>){
 const closeButtonRef=useRef<HTMLButtonElement>(null),modalRef=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!open)return;
  const trigger=returnFocusRef.current;
  const siblings:HTMLElement[]=[];let ancestor:HTMLElement|null=modalRef.current;
  while(ancestor?.parentElement){for(const sibling of Array.from(ancestor.parentElement.children)){if(sibling!==ancestor&&sibling instanceof window.HTMLElement&&!sibling.inert){sibling.inert=true;siblings.push(sibling);}}ancestor=ancestor.parentElement;if(ancestor===document.body)break;}
  const previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";closeButtonRef.current?.focus();
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!applying){event.preventDefault();onClose();}};
  window.addEventListener("keydown",escape);
  return ()=>{document.body.style.overflow=previousOverflow;for(const sibling of siblings)sibling.inert=false;window.removeEventListener("keydown",escape);trigger?.focus();};
 },[open,applying,onClose,returnFocusRef]);
 const keepFocus=(event:ReactKeyboardEvent<HTMLElement>)=>{
  if(event.key!=="Tab")return;
  const controls=Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]):not([tabindex="-1"]),select:not([disabled]),textarea:not([disabled]),summary,a[href]')??[]).filter(control=>{const details=control.closest('details:not([open])');return !control.closest('[hidden]')&&(!details||(control.tagName==='SUMMARY'&&control.parentElement===details));});
  const first=controls[0],last=controls.at(-1);if(!first||!last)return;
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 };
 if(!open)return null;
 return <><div className={styles.modalBackdrop} aria-hidden="true" onClick={()=>{if(!applying)onClose();}}/><aside ref={modalRef} className={styles.settingsModal} role="dialog" aria-modal="true" aria-labelledby="design-modal-title" aria-describedby="design-modal-description" onKeyDown={keepFocus}>
  <header className={styles.modalHeader}><div><h2 id="design-modal-title">{surface.label}</h2><p className={styles.srOnly} id="design-modal-description">{surface.hint}</p></div><button ref={closeButtonRef} type="button" disabled={applying} aria-label="Vazgeç ve kapat" onClick={onClose}><X size={20}/></button></header>
  <div className={styles.modalBody}>{children}</div>
  <footer className={styles.modalFooter}><button type="button" className={styles.cancelButton} disabled={applying} onClick={onClose}>Vazgeç</button><button type="button" disabled={applying||applyDisabled} onClick={onApply}>{applying?"Uygulanıyor…":"Uygula"}</button></footer>
 </aside></>;
}
