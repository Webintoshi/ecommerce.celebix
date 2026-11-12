"use client";

import type { MerchantPaymentMethod } from "@celebix/saas-contracts";
import { ArrowDown, ArrowUp, GripVertical, Save, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";

import {
  PaymentMethodApiError,
  paymentMethodApi,
} from "@/lib/payment-method-ui/client";
import {
  buildPaymentMethodOrderCommands,
  hasPaymentMethodOrderChanged,
  movePaymentMethodOrder,
} from "@/lib/payment-settings-ui/console-state";
import type { buildPaymentSettingsViewModel } from "@/lib/payment-settings-ui/model";

import { PaymentModal } from "./PaymentModal";
import styles from "./payment-settings.module.css";

type MethodRow = ReturnType<typeof buildPaymentSettingsViewModel>["methods"][number];

function placeBefore(order: readonly string[], movingId: string, targetId: string): readonly string[] {
  if (movingId === targetId || !order.includes(movingId) || !order.includes(targetId)) return Object.freeze([...order]);
  const selected = order.filter((id) => id !== movingId);
  const target = selected.indexOf(targetId);
  selected.splice(target, 0, movingId);
  return Object.freeze(selected);
}

export function PaymentMethodOrderDialog(props: Readonly<{
  methods: readonly MerchantPaymentMethod[];
  rows: readonly MethodRow[];
  canManage: boolean;
  mutationAvailable: boolean;
  mutationBusy: boolean;
  openerRef: RefObject<HTMLButtonElement | null>;
  onReload(): Promise<void>;
  onClose(): void;
}>) {
  const canManage = props.canManage;
  const closeRef = useRef<HTMLButtonElement>(null);
  const originalIds = useMemo(() => props.methods.map(({ id }) => id), [props.methods]);
  const [order, setOrder] = useState<readonly string[]>(originalIds);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const changed = hasPaymentMethodOrderChanged(originalIds, order);
  const mutationBlocked = !canManage || !props.mutationAvailable || props.mutationBusy || busy;
  const rowsById = useMemo(() => new Map(props.rows.map((row) => [row.id, row] as const)), [props.rows]);

  useEffect(() => { setOrder(Object.freeze([...originalIds])); }, [originalIds]);
  function close(force = false) {
    if (busy && !force) return;
    props.onClose();
  }

  function drop(event: DragEvent<HTMLLIElement>, targetId: string) {
    event.preventDefault();
    if (!dragging || mutationBlocked) return;
    setOrder((current) => placeBefore(current, dragging, targetId));
    setDragging(null);
  }

  async function save() {
    if (!changed || mutationBlocked) return;
    setBusy(true);
    setMessage("");
    try {
      await paymentMethodApi.reorder(buildPaymentMethodOrderCommands(props.methods, order));
      await props.onReload();
      close(true);
    } catch (error) {
      if (error instanceof PaymentMethodApiError && error.code === "version_conflict") {
        setMessage("Sıralama sizden önce güncellendi; güncel liste yeniden yüklendi.");
        await props.onReload();
      } else setMessage(error instanceof PaymentMethodApiError ? error.message : "Sıralama kaydedilemedi.");
    } finally { setBusy(false); }
  }

  return (
      <PaymentModal className={styles.orderDialog} labelledBy="payment-order-title" describedBy="payment-order-description" initialFocusRef={closeRef} openerRef={props.openerRef} onDismiss={() => close()}>
        <header className={styles.dialogHeader}>
          <div className={styles.dialogTitleIcon}><GripVertical aria-hidden="true" /></div>
          <div><h2 id="payment-order-title">Checkout sırası</h2><p id="payment-order-description">Etkin ödeme yöntemlerinin müşteriye görüneceği sırayı düzenleyin ve önizleyin.</p></div>
          <button ref={closeRef} className={styles.iconButton} type="button" disabled={busy} onClick={() => close()} aria-label="Sıralama penceresini kapat"><X /></button>
        </header>
        {!props.canManage ? <p className={styles.readOnlyNotice}>Salt okunur erişim: mevcut checkout sırasını inceleyebilirsiniz.</p> : null}
        {message ? <p className={styles.errorNotice} role="alert">{message}</p> : null}

        <div className={styles.orderLayout}>
          <section className={styles.orderEditor} aria-labelledby="payment-order-list-title">
            <h3 id="payment-order-list-title">Ödeme yöntemleri</h3>
            {order.length === 0 ? <p className={styles.dialogState}>Sıralanacak ödeme yöntemi yok.</p> : (
              <ol>
                {order.map((id, index) => {
                  const row = rowsById.get(id);
                  if (!row) return null;
                  return <li key={id} draggable={!mutationBlocked} onDragStart={() => { if (!mutationBlocked) setDragging(id); }} onDragEnd={() => setDragging(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, id)}>
                    <GripVertical aria-hidden="true" />
                    <span><strong>{row.label}</strong><small>{row.providerLabel} · {row.stateLabel}</small></span>
                    <div>
                      <button type="button" disabled={mutationBlocked || index === 0} onClick={() => { if (!mutationBlocked) setOrder((current) => movePaymentMethodOrder(current, id, "up")); }} aria-label={`${row.label} yöntemini yukarı taşı`}><ArrowUp /><span>Yukarı</span></button>
                      <button type="button" disabled={mutationBlocked || index === order.length - 1} onClick={() => { if (!mutationBlocked) setOrder((current) => movePaymentMethodOrder(current, id, "down")); }} aria-label={`${row.label} yöntemini aşağı taşı`}><ArrowDown /><span>Aşağı</span></button>
                    </div>
                  </li>;
                })}
              </ol>
            )}
          </section>
          <aside className={styles.checkoutPreview} aria-labelledby="checkout-preview-title">
            <span className={styles.previewBrand}>CELEBIX CHECKOUT</span>
            <h3 id="checkout-preview-title">Ödeme yöntemi</h3>
            <p>Siparişinizi nasıl ödemek istersiniz?</p>
            <div>
              {order.map((id) => rowsById.get(id)).filter((row): row is MethodRow => row?.state === "active").map((row) => <span key={row.id}><i aria-hidden="true" />{row.label}</span>)}
              {order.every((id) => rowsById.get(id)?.state !== "active") ? <small>Etkin ödeme yöntemi yok.</small> : null}
            </div>
          </aside>
        </div>

        <footer className={styles.dialogActions}>
          <span>{changed ? "Kaydedilmemiş sıralama değişikliği var." : "Sıralama güncel."}</span>
          <button type="button" className={styles.secondaryButton} onClick={() => close()} disabled={busy}>Vazgeç</button>
          <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={!canManage || !props.mutationAvailable || props.mutationBusy || !changed || busy}><Save />{busy ? "Kaydediliyor…" : "Kaydet"}</button>
        </footer>
      </PaymentModal>
  );
}
