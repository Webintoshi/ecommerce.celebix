'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './collections.module.css';

export function CollectionDialog({title,children,footer,onClose,wide=false,blocked=false}:{title:string;children:ReactNode;footer?:ReactNode;onClose():void;wide?:boolean;blocked?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);const closeRef=useRef<HTMLButtonElement>(null);const titleId=useId();const callbacks=useRef({onClose,blocked});callbacks.current={onClose,blocked};
 useEffect(()=>{const origin=document.activeElement as HTMLElement|null;const dialog=ref.current;if(!dialog)return;dialog.showModal();closeRef.current?.focus();return()=>{dialog.close();if(origin?.isConnected)origin.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className={`${styles.dialog} ${wide?styles.dialogWide:''}`} aria-labelledby={titleId} aria-modal="true" onCancel={event=>{event.preventDefault();if(!callbacks.current.blocked)callbacks.current.onClose();}} onKeyDown={event=>{if(event.key!=='Tab')return;const elements=[...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')??[])].filter(element=>!element.hidden);if(!elements.length){event.preventDefault();return;}const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}>
 <div className={styles.dialogHead}><h2 id={titleId}>{title}</h2><button ref={closeRef} className={styles.iconButton} type="button" aria-label="Kapat" disabled={blocked} onClick={onClose}><X aria-hidden="true"/></button></div><div className={styles.dialogBody}>{children}</div>{footer?<div className={styles.dialogFoot}>{footer}</div>:null}</dialog>;
}
