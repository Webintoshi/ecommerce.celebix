"use client";

import type { InventoryLocation } from "@celebix/saas-contracts";
import { useEffect, useRef, useState } from "react";

import { PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { inventoryApi } from "@/lib/inventory-ui/client";
import { createInventoryLocationConsoleController, type InventoryLocationConsoleSnapshot } from "@/lib/inventory-ui/console-controller";
import styles from "./inventory-console.module.css";

const ARCHIVE_REASON = Object.freeze({
  default: "Varsayılan konum arşivlenemez.",
  positive_on_hand: "Pozitif stok bakiyesi bulunduğu için arşivlenemez.",
  reserved: "Aktif stok rezervasyonu bulunduğu için arşivlenemez.",
  open_purchase: "Açık satın alma kaydı bulunduğu için arşivlenemez.",
  open_count: "Açık stok sayımı bulunduğu için arşivlenemez.",
  open_transfer: "Açık stok transferi bulunduğu için arşivlenemez.",
  archived: "Arşivlenmiş konum değiştirilemez.",
} satisfies Readonly<Record<Exclude<InventoryLocation["archiveEligibility"]["reason"], null>, string>>);

export function InventoryLocationRenameDialog(props: Readonly<{
  location: InventoryLocation;
  name: string;
  pending: boolean;
  error: string;
  onName(value: string): void;
  onCancel(): void;
  onSubmit(): void;
}>) {
  const dialog = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const container = dialog.current;
    if (!container) return;
    input.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !props.pending) {
        event.preventDefault();
        props.onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [props.onCancel, props.pending]);
  const feedback = props.error || (props.pending ? "Konum adı kalıcı kayıtta güncelleniyor…" : "");
  return <div className={styles.locationRenameBackdrop}>
    <div
      ref={dialog}
      className={styles.locationRenameDialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-location-rename-title"
      aria-describedby={feedback ? "inventory-location-rename-feedback" : undefined}
    >
      <h3 id="inventory-location-rename-title">Konum adını düzenle</h3>
      <p><code>{props.location.id}</code> konumunun görünen adını güncelleyin.</p>
      <form onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
        <label htmlFor="inventory-location-rename-name">Yeni konum adı</label>
        <input
          ref={input}
          id="inventory-location-rename-name"
          value={props.name}
          maxLength={200}
          disabled={props.pending}
          aria-invalid={Boolean(props.error)}
          aria-describedby={feedback ? "inventory-location-rename-feedback" : undefined}
          onChange={(event) => props.onName(event.currentTarget.value)}
        />
        {feedback ? <p id="inventory-location-rename-feedback" className={props.error ? styles.errorNotice : styles.notice} role={props.error ? "alert" : "status"}>{feedback}</p> : null}
        <div className={styles.locationRenameActions}>
          <button type="button" disabled={props.pending} onClick={props.onCancel}>Vazgeç</button>
          <button type="submit" disabled={props.pending || !props.name.trim()}>Adı kaydet</button>
        </div>
      </form>
    </div>
  </div>;
}

export function InventoryLocationPresentation(props: Readonly<{
  state: InventoryLocationConsoleSnapshot;
  canManage: boolean;
  name: string;
  rename?: Readonly<{ location: InventoryLocation; name: string; error: string }>;
  onName(value: string): void;
  onCreate(): void;
  onEdit(location: InventoryLocation, trigger: HTMLButtonElement): void;
  onRenameName?(value: string): void;
  onRenameCancel?(): void;
  onRenameSubmit?(): void;
  onArchive(location: InventoryLocation): void;
}>) {
  if (props.state.phase === "denied") return <section className={styles.denied} role="status">Konumları görüntüleme yetkiniz yok.</section>;
  if (props.state.phase === "loading") return <section className={styles.state} role="status">Konumlar yükleniyor…</section>;
  if (props.state.phase === "error") return <section className={styles.error} role="alert">{props.state.message}</section>;
  return <section className={styles.locationManager} aria-labelledby="inventory-locations-title">
    <header><div><h2 id="inventory-locations-title">Envanter konumları</h2><p>Transferlerde kullanılacak kalıcı aktif depoları yönetin.</p></div></header>
    {props.state.message ? <p className={props.state.phase === "conflict" || props.state.phase === "verification_unavailable" ? styles.errorNotice : styles.notice} role={props.state.phase === "conflict" || props.state.phase === "verification_unavailable" ? "alert" : "status"}>{props.state.message}</p> : null}
    {props.canManage ? <form className={styles.locationCreate} onSubmit={(event) => { event.preventDefault(); props.onCreate(); }}>
      <label htmlFor="inventory-location-name">Yeni konum adı</label>
      <input id="inventory-location-name" value={props.name} maxLength={200} disabled={props.state.pending || props.state.locked} onChange={(event) => props.onName(event.currentTarget.value)} />
      <button type="submit" disabled={props.state.pending || props.state.locked || !props.name.trim()}>Konum oluştur</button>
    </form> : null}
    {!props.state.items.length ? <p className={styles.state}>Ek konum bulunmuyor. Varsayılan konum kalıcı sistem tarafından oluşturulur.</p> : <div className={styles.locationGrid}>{props.state.items.map((location) => {
      const reason = location.archiveEligibility.canArchive
        ? "Aktif konum transferlerde kullanılabilir."
        : ARCHIVE_REASON[location.archiveEligibility.reason];
      const editDisabled = props.state.pending || props.state.locked || location.status !== "active" || location.isDefault;
      const archiveDisabled = props.state.pending || props.state.locked || !location.archiveEligibility.canArchive;
      return <article className={styles.locationCard} key={location.id}>
        <div><strong>{location.name}</strong><PanelStatusBadge tone={location.status === "active" ? "success" : "neutral"}>{location.status === "active" ? "Aktif" : "Arşivlenmiş"}</PanelStatusBadge></div>
        <code>{location.id}</code><p>Sürüm {location.version}</p><p>{reason}</p>
        {props.canManage ? <div className={styles.locationActions}>
          <button type="button" disabled={editDisabled} onClick={(event) => props.onEdit(location, event.currentTarget)}>Adı düzenle</button>
          <button type="button" disabled={archiveDisabled} onClick={() => props.onArchive(location)}>Arşivle</button>
        </div> : null}
      </article>;
    })}</div>}
    {props.rename ? <InventoryLocationRenameDialog
      location={props.rename.location}
      name={props.rename.name}
      pending={props.state.pending}
      error={props.rename.error}
      onName={(value) => props.onRenameName?.(value)}
      onCancel={() => props.onRenameCancel?.()}
      onSubmit={() => props.onRenameSubmit?.()}
    /> : null}
  </section>;
}

export function InventoryLocationConsole(props: Readonly<{ canRead: boolean; canManage: boolean }>) {
  const [name, setName] = useState("");
  const [rename, setRename] = useState<Readonly<{ location: InventoryLocation; name: string; error: string }> | undefined>();
  const [state, setState] = useState<InventoryLocationConsoleSnapshot>({ phase: props.canRead ? "loading" : "denied", items: [], pending: false, locked: false, message: "" });
  const controller = useRef<ReturnType<typeof createInventoryLocationConsoleController> | null>(null);
  const renameTrigger = useRef<HTMLButtonElement | null>(null);
  const renameSubmitting = useRef(false);
  useEffect(() => {
    const next = createInventoryLocationConsoleController({ canRead: props.canRead, canManage: props.canManage, api: inventoryApi, onChange: setState });
    controller.current = next; void next.load();
    return () => { next.dispose(); if (controller.current === next) controller.current = null; };
  }, [props.canRead, props.canManage]);
  const closeRename = () => {
    if (renameSubmitting.current) return;
    const trigger = renameTrigger.current;
    renameTrigger.current = null;
    setRename(undefined);
    queueMicrotask(() => trigger?.focus());
  };
  return <InventoryLocationPresentation state={state} canManage={props.canManage} name={name} onName={setName}
    onCreate={() => { const selected = name.trim(); if (selected) { void controller.current?.save({ name: selected }); setName(""); } }}
    rename={rename}
    onEdit={(location, trigger) => {
      renameTrigger.current = trigger;
      setRename({ location, name: location.name, error: "" });
    }}
    onRenameName={(value) => setRename((current) => current ? { ...current, name: value, error: "" } : current)}
    onRenameCancel={closeRename}
    onRenameSubmit={() => {
      if (!rename || renameSubmitting.current) return;
      const selected = rename.name.trim();
      if (!selected) {
        setRename({ ...rename, error: "Konum adı zorunludur." });
        return;
      }
      const target = rename;
      renameSubmitting.current = true;
      void (async () => {
        await controller.current?.save({
          locationId: target.location.id,
          expectedVersion: target.location.version,
          name: selected,
        });
        renameSubmitting.current = false;
        const phase = controller.current?.getSnapshot().phase;
        if (phase === "committed" || phase === "replayed") {
          closeRename();
          return;
        }
        setRename((current) => current ? {
          ...current,
          error: controller.current?.getSnapshot().message || "Konum adı güncellenemedi.",
        } : current);
      })();
    }}
    onArchive={(location) => { void controller.current?.archive(location); }} />;
}
