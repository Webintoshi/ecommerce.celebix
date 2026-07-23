"use client";

import type { InventoryLocation } from "@celebix/saas-contracts";
import { useEffect, useRef, useState } from "react";

import { PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { inventoryApi } from "@/lib/inventory-ui/client";
import { createInventoryLocationConsoleController, type InventoryLocationConsoleSnapshot } from "@/lib/inventory-ui/console-controller";
import styles from "./inventory-console.module.css";

export function InventoryLocationPresentation(props: Readonly<{
  state: InventoryLocationConsoleSnapshot;
  canManage: boolean;
  name: string;
  onName(value: string): void;
  onCreate(): void;
  onEdit(location: InventoryLocation): void;
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
      const reason = location.isDefault ? "Varsayılan konum arşivlenemez." : location.status === "archived" ? "Arşivlenmiş konum değiştirilemez." : "Aktif konum transferlerde kullanılabilir.";
      const disabled = props.state.pending || props.state.locked || location.status !== "active";
      return <article className={styles.locationCard} key={location.id}>
        <div><strong>{location.name}</strong><PanelStatusBadge tone={location.status === "active" ? "success" : "neutral"}>{location.status === "active" ? "Aktif" : "Arşivlenmiş"}</PanelStatusBadge></div>
        <code>{location.id}</code><p>Sürüm {location.version}</p><p>{reason}</p>
        {props.canManage ? <div className={styles.locationActions}>
          <button type="button" disabled={disabled || location.isDefault} onClick={() => props.onEdit(location)}>Adı düzenle</button>
          <button type="button" disabled={disabled || location.isDefault} onClick={() => props.onArchive(location)}>Arşivle</button>
        </div> : null}
      </article>;
    })}</div>}
  </section>;
}

export function InventoryLocationConsole(props: Readonly<{ canRead: boolean; canManage: boolean }>) {
  const [name, setName] = useState("");
  const [state, setState] = useState<InventoryLocationConsoleSnapshot>({ phase: props.canRead ? "loading" : "denied", items: [], pending: false, locked: false, message: "" });
  const controller = useRef<ReturnType<typeof createInventoryLocationConsoleController> | null>(null);
  useEffect(() => {
    const next = createInventoryLocationConsoleController({ canRead: props.canRead, canManage: props.canManage, api: inventoryApi, onChange: setState });
    controller.current = next; void next.load();
    return () => { next.dispose(); if (controller.current === next) controller.current = null; };
  }, [props.canRead, props.canManage]);
  return <InventoryLocationPresentation state={state} canManage={props.canManage} name={name} onName={setName}
    onCreate={() => { const selected = name.trim(); if (selected) { void controller.current?.save({ name: selected }); setName(""); } }}
    onEdit={(location) => { const selected = window.prompt("Yeni konum adı", location.name)?.trim(); if (selected) void controller.current?.save({ locationId: location.id, expectedVersion: location.version, name: selected }); }}
    onArchive={(location) => { void controller.current?.archive(location); }} />;
}
