import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import styles from "./payment-settings.module.css";

let openModals = 0;
let previousBodyOverflow = "";

export function PaymentModal({ className, labelledBy, describedBy, initialFocusRef, openerRef, onDismiss, closeOnBackdrop = true, children }: Readonly<{
  className: string;
  labelledBy: string;
  describedBy: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  openerRef?: RefObject<HTMLElement | null>;
  onDismiss(): void;
  closeOnBackdrop?: boolean;
  children: ReactNode;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const body = dialog.ownerDocument.body;
    dialog.showModal();
    initialFocusRef?.current?.focus();

    if (openModals++ === 0) {
      previousBodyOverflow = body.style.overflow;
      body.style.overflow = "hidden";
    }

    const opener = openerRef?.current;
    return () => {
      dialog.close();
      if (--openModals === 0) body.style.overflow = previousBodyOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocusRef, openerRef]);

  return <dialog
    ref={dialogRef}
    className={`${styles.paymentModal} ${className}`}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
    onCancel={(event) => {
      event.preventDefault();
      onDismiss();
    }}
    onClick={(event) => {
      if (!closeOnBackdrop || event.target !== event.currentTarget || event.detail === 0) return;
      const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onDismiss();
    }}
  >{children}</dialog>;
}
