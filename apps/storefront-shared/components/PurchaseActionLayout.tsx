import { Children, type ReactNode, type Ref } from "react";
import styles from "./purchase-action-layout.module.css";

export function PurchaseActionLayout({ quantity, children, className, actionRef }: Readonly<{
  quantity?: ReactNode;
  children: ReactNode;
  className?: string;
  actionRef?: Ref<HTMLDivElement>;
}>) {
  const hasActions = Children.toArray(children).length > 0;
  if (!quantity && !hasActions) return null;

  return <div className={styles.layout} data-standard-purchase-actions data-quantity-hidden={!quantity || undefined} data-quantity-only={!hasActions || undefined} ref={actionRef}>
    {quantity ? <div className={styles.quantity}>{quantity}</div> : null}
    <div className={`${styles.actions}${className ? ` ${className}` : ""}`}>{children}</div>
  </div>;
}
