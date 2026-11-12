import { CreditCard, ShieldAlert } from "lucide-react";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import type { MerchantPaymentMethod } from "@celebix/saas-contracts";

import { PaymentModal } from "./PaymentModal";
import styles from "./payment-settings.module.css";

export type PaymentStateChange = "active" | "disabled" | "emergency_disabled";

export function PaymentStateDialog({ method, state, openerRef, onCancel, onConfirm }: Readonly<{
  method: MerchantPaymentMethod;
  state: PaymentStateChange;
  openerRef: RefObject<HTMLElement | null>;
  onCancel(): void;
  onConfirm(reason: string | null): void;
}>) {
  const emergency = state === "emergency_disabled";
  const active = state === "active";
  const [invalid, setInvalid] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = emergency ? reasonRef.current?.value.trim() ?? "" : null;
    if (reason !== null && (reason.length < 3 || reason.length > 240)) {
      setInvalid(true);
      reasonRef.current?.focus();
      return;
    }
    onConfirm(reason);
  }

  return <PaymentModal className={styles.stateDialog} labelledBy="payment-state-title" describedBy="payment-state-description" initialFocusRef={cancelRef} openerRef={openerRef} onDismiss={onCancel} closeOnBackdrop={false}>
    <header className={styles.dialogHeader}>
      <div className={styles.dialogTitleIcon}>{emergency ? <ShieldAlert aria-hidden="true" /> : <CreditCard aria-hidden="true" />}</div>
      <div>
        <h2 id="payment-state-title">{method.label} {emergency ? "acil kapatılsın mı?" : active ? "etkinleştirilsin mi?" : "devre dışı bırakılsın mı?"}</h2>
        <p id="payment-state-description">{active ? "Müşteriler bu yöntemi ödeme ekranında kullanabilir." : "Bu yöntem müşterilerin ödeme ekranında kullanılamaz."}</p>
      </div>
    </header>
    <form onSubmit={submit} noValidate>
      {emergency ? <div className={styles.stateReason} data-invalid={invalid || undefined}>
        <label htmlFor="payment-emergency-reason">Acil kapatma nedeni</label>
        <input ref={reasonRef} id="payment-emergency-reason" required minLength={3} maxLength={240} aria-invalid={invalid || undefined} aria-describedby="payment-emergency-reason-help" onChange={() => setInvalid(false)} />
        <small id="payment-emergency-reason-help" role={invalid ? "alert" : undefined}>Neden 3–240 karakter olmalıdır.</small>
      </div> : null}
      <footer className={styles.dialogActions}>
        <button ref={cancelRef} className={styles.secondaryButton} type="button" onClick={onCancel}>Vazgeç</button>
        <button className={styles.primaryButton} type="submit">{emergency ? "Acil kapat" : active ? "Etkinleştir" : "Devre dışı bırak"}</button>
      </footer>
    </form>
  </PaymentModal>;
}
