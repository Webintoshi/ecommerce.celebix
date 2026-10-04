"use client";

import { ChevronDown, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { InventoryCountConsole } from "./InventoryCountConsole";
import { InventoryLocationConsole } from "./InventoryLocationConsole";
import { InventoryTransferConsole } from "./InventoryTransferConsole";
import { InventoryWorkspaceProvider, useInventoryWorkspace } from "./InventoryWorkspaceContext";
import { PurchasingConsole } from "./PurchasingConsole";
import { StockOverview } from "./StockOverview";
import styles from "./stock-workspace.module.css";

type Tab = "overview" | "counts" | "transfers" | "purchases" | "locations";
type Kind = "count" | "purchase" | "transfer";
type DialogTarget = Readonly<{ kind: Kind; id?: string; locationId?: string; variantId?: string }>;
type View = Readonly<{ tab: Tab; dialog: DialogTarget | null }>;
type Activity = Readonly<{ pending: boolean; locked: boolean; dirty?: boolean }>;

export type StockWorkspaceProps = Readonly<{
  canReadInventory: boolean;
  canManageInventory: boolean;
  canReadPurchasing: boolean;
  canManagePurchasing: boolean;
}>;

const TABS: readonly Readonly<{ id: Tab; label: string; inventory: boolean }>[] = [
  { id: "overview", label: "Ürünler", inventory: true },
  { id: "counts", label: "Sayımlar", inventory: true },
  { id: "transfers", label: "Taşımalar", inventory: true },
  { id: "purchases", label: "Satın almalar", inventory: false },
  { id: "locations", label: "Depolar", inventory: true },
];
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDLE: Activity = { pending: false, locked: false, dirty: false };
const BASE = "/products/stock";
const dialogKey = (target: DialogTarget | null) => target ? [target.kind, target.id ?? "new", target.locationId ?? "", target.variantId ?? ""].join(":") : "";

function allowedTabs(props: StockWorkspaceProps) {
  return TABS.filter(tab => tab.inventory ? props.canReadInventory : props.canReadPurchasing);
}

function readView(query: URLSearchParams, props: StockWorkspaceProps): Readonly<{ view: View; notice: string }> {
  const tabs = allowedTabs(props);
  const tab = tabs.find(item => item.id === query.get("tab"))?.id ?? tabs[0]?.id ?? "overview";
  const kind = query.get("kind"), id = query.get("id"), create = query.get("new");
  if (!kind && !id && !create) return { view: { tab, dialog: null }, notice: "" };
  if (!["count", "purchase", "transfer"].includes(kind ?? "") || (id ? !ID.test(id) || create !== null : create !== "1")) {
    return { view: { tab, dialog: null }, notice: "Stok işlemi bağlantısı geçerli değil. İlgili sekmeden bir kayıt seçin." };
  }
  const purchasing = kind === "purchase";
  const canRead = purchasing ? props.canReadPurchasing : props.canReadInventory;
  const canManage = purchasing ? props.canManagePurchasing : props.canManageInventory;
  if (!canRead || (!id && !canManage)) return { view: { tab, dialog: null }, notice: "Bu stok işlemi için yetkiniz yok." };
  const locationId = query.get("locationId"), variantId = query.get("variantId");
  return { view: { tab, dialog: { kind: kind as Kind, ...(id ? { id } : {}), ...(!id && locationId && ID.test(locationId) ? { locationId } : {}), ...(!id && variantId && ID.test(variantId) ? { variantId } : {}) } }, notice: "" };
}

function viewHref(view: View) {
  const query = new URLSearchParams({ tab: view.tab });
  if (view.dialog) {
    query.set("kind", view.dialog.kind);
    if (view.dialog.id) query.set("id", view.dialog.id); else query.set("new", "1");
    if (view.dialog.locationId) query.set("locationId", view.dialog.locationId);
    if (view.dialog.variantId) query.set("variantId", view.dialog.variantId);
  }
  return `${BASE}?${query}`;
}

function visibleControls(element: HTMLElement) {
  return [...element.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')].filter(control => {
    if (control.tabIndex < 0) return false;
    if (control.closest('[hidden], [inert], [aria-hidden="true"], fieldset[disabled]')) return false;
    let parent: HTMLElement | null = control;
    while (parent && parent !== element) {
      const computed = window.getComputedStyle(parent);
      if (computed.display === "none" || computed.visibility === "hidden") return false;
      parent = parent.parentElement;
    }
    const details = control.closest("details:not([open])");
    return !details || details.querySelector("summary") === control;
  });
}

function StockWorkspaceBody(props: StockWorkspaceProps) {
  const router = useRouter(), searchParams = useSearchParams(), query = searchParams.toString();
  const { reload } = useInventoryWorkspace();
  const parsed = readView(new URLSearchParams(query), props);
  const [view, setView] = useState<View>(parsed.view);
  const viewRef = useRef(view);
  const [notice, setNotice] = useState(parsed.notice);
  const [activity, setActivity] = useState<Activity>(IDLE);
  const activityRef = useRef<Activity>(IDLE);
  const locationActivityRef = useRef<Activity>(IDLE);
  const [discardTarget, setDiscardTarget] = useState<View | null>(null);
  const [listRevision, setListRevision] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null), action = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null), backdrop = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLElement | null>(null), originHref = useRef<string | null>(null);
  const headingId = useId(), menuId = useId();
  const tabs = allowedTabs(props), selected = tabs.find(tab => tab.id === view.tab);
  const canCount = props.canReadInventory && props.canManageInventory;
  const canPurchase = props.canReadPurchasing && props.canManagePurchasing;
  const hasActions = canCount || canPurchase;
  const protectedDialog = activity.pending || activity.locked;
  const captureOrigin = () => {
    const current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    origin.current = current?.closest('[role="menu"]') ? action.current : current;
    originHref.current = current?.closest("a")?.getAttribute("href") ?? null;
  };

  const updateActivity = useCallback((next: Activity) => {
    activityRef.current = next;
    setActivity(next);
  }, []);
  const updateLocationActivity = useCallback((next: Activity) => { locationActivityRef.current = next; }, []);
  function currentActivity() {
    return viewRef.current.dialog ? activityRef.current : viewRef.current.tab === "locations" ? locationActivityRef.current : IDLE;
  }
  function locationDialogOpen() {
    return !viewRef.current.dialog && viewRef.current.tab === "locations" && Boolean(document.querySelector('[role="dialog"][aria-labelledby="inventory-location-rename-title"]'));
  }

  const applyView = useCallback((next: View) => {
    const previous = viewRef.current;
    if (previous.tab === "locations" && next.tab !== "locations") locationActivityRef.current = IDLE;
    if (dialogKey(previous.dialog) !== dialogKey(next.dialog)) {
      if (previous.dialog) { reload(); setListRevision(revision => revision + 1); }
      activityRef.current = IDLE;
      setActivity(IDLE);
      setDiscardTarget(null);
    }
    viewRef.current = next;
    setView(next);
  }, [reload]);

  useEffect(() => {
    const next = readView(new URLSearchParams(query), props);
    const current = viewRef.current;
    const leavesDialog = current.dialog && (dialogKey(current.dialog) !== dialogKey(next.view.dialog) || current.tab !== next.view.tab);
    const leavesLocations = !current.dialog && current.tab === "locations" && (next.view.tab !== "locations" || next.view.dialog !== null);
    const active = currentActivity();
    if ((leavesDialog || leavesLocations) && (active.pending || active.locked)) {
      setNotice("İşlem sürerken veya sonucu doğrulanmamışken bu pencere kapatılamaz.");
      router.replace(viewHref(current), { scroll: false });
      return;
    }
    if (leavesLocations && (active.dirty || locationDialogOpen())) {
      setNotice("Önce depo düzenlemesini kaydedin veya geri alın.");
      router.replace(viewHref(current), { scroll: false });
      return;
    }
    if (leavesDialog && activityRef.current.dirty) {
      setDiscardTarget(next.view);
      router.replace(viewHref(current), { scroll: false });
      return;
    }
    if (!current.dialog && next.view.dialog) captureOrigin();
    setNotice(next.notice);
    applyView(next.view);
  }, [query, props.canReadInventory, props.canManageInventory, props.canReadPurchasing, props.canManagePurchasing, router, applyView]);

  useEffect(() => {
    if (!view.dialog && view.tab !== "locations") return;
    const historyState = window.history.state;
    const preventUnload = (event: BeforeUnloadEvent) => {
      const active = currentActivity();
      if (active.pending || active.locked || active.dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    const preventProtectedTraversal = (event: PopStateEvent) => {
      const active = currentActivity();
      if (!active.pending && !active.locked && !active.dirty && !locationDialogOpen()) return;
      // A capture listener runs before the router's restore listener. Keep the
      // mounted controller when browser Back would otherwise leave this page.
      event.stopImmediatePropagation();
      window.history.pushState(historyState, "", viewHref(viewRef.current));
      setNotice(active.pending || active.locked ? "İşlem sürerken veya sonucu doğrulanmamışken bu görünümden çıkılamaz." : "Önce düzenlemeyi kaydedin veya geri alın.");
    };
    window.addEventListener("beforeunload", preventUnload);
    window.addEventListener("popstate", preventProtectedTraversal, true);
    return () => {
      window.removeEventListener("beforeunload", preventUnload);
      window.removeEventListener("popstate", preventProtectedTraversal, true);
    };
  }, [!!view.dialog, view.tab === "locations"]);

  function requestView(next: View, replace = false) {
    setMenuOpen(false);
    const refuse = (message: string) => {
      setNotice(message);
      if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[role="menu"]')) action.current?.focus();
    };
    if (next.dialog) {
      const purchasing = next.dialog.kind === "purchase";
      const canRead = purchasing ? props.canReadPurchasing : props.canReadInventory;
      const canManage = purchasing ? props.canManagePurchasing : props.canManageInventory;
      if (!canRead || (!next.dialog.id && !canManage)) { refuse("Bu stok işlemi için yetkiniz yok."); return; }
    }
    const active = currentActivity();
    if (active.pending || active.locked) {
      refuse("İşlem sürerken veya sonucu doğrulanmamışken bu görünümden çıkılamaz.");
      return;
    }
    if (!viewRef.current.dialog && viewRef.current.tab === "locations" && (active.dirty || locationDialogOpen())) {
      refuse("Önce depo düzenlemesini kaydedin veya geri alın.");
      return;
    }
    if (viewRef.current.dialog && activityRef.current.dirty) { setDiscardTarget(next); return; }
    if (!viewRef.current.dialog && next.dialog) captureOrigin();
    setNotice("");
    applyView(next);
    router[replace ? "replace" : "push"](viewHref(next), { scroll: false });
  }

  function open(kind: Kind, selection?: Readonly<{ locationId: string; variantId?: string }>) {
    requestView({ tab: viewRef.current.tab, dialog: { kind, ...selection } });
  }

  const activeKey = dialogKey(view.dialog);
  useEffect(() => {
    if (!view.dialog || !backdrop.current) return;
    const previous = origin.current ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
    const previousHref = originHref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const hidden: { element: HTMLElement; inert: boolean; ariaHidden: string | null }[] = [];
    let current: HTMLElement | null = backdrop.current;
    while (current && current !== document.body) {
      for (const sibling of current.parentElement?.children ?? []) if (sibling !== current && sibling instanceof HTMLElement) {
        hidden.push({ element: sibling, inert: sibling.inert, ariaHidden: sibling.getAttribute("aria-hidden") });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      }
      current = current.parentElement;
    }
    dialog.current?.focus();
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !dialog.current?.contains(event.target)) dialog.current?.focus();
    };
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("focusin", containFocus);
      document.body.style.overflow = overflow;
      for (const item of hidden) {
        item.element.inert = item.inert;
        if (item.ariaHidden === null) item.element.removeAttribute("aria-hidden"); else item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      let destination = previous?.isConnected ? previous : null;
      if (!destination && previousHref) destination = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].find(link => link.getAttribute("href") === previousHref) ?? null;
      (destination ?? action.current ?? document.getElementById(`stock-tab-${viewRef.current.tab}`))?.focus();
      origin.current = null;
      originHref.current = null;
    };
  }, [activeKey]);

  useEffect(() => {
    if (!menuOpen) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target)) setMenuOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menuOpen]);

  function dialogKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (discardTarget) { setDiscardTarget(null); dialog.current?.focus(); }
      else requestView({ tab: viewRef.current.tab, dialog: null }, true);
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const controls = visibleControls(dialog.current), first = controls[0], last = controls.at(-1);
    const current = document.activeElement;
    if (!first) { event.preventDefault(); dialog.current.focus(); }
    else if (current === dialog.current || !dialog.current.contains(current) || (event.shiftKey ? current === first : current === last)) {
      event.preventDefault(); (event.shiftKey ? last : first)?.focus();
    }
  }

  function menuKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); action.current?.focus(); return; }
    if (event.key === "Tab") {
      event.preventDefault();
      setMenuOpen(false);
      (event.shiftKey ? action.current : document.getElementById(`stock-panel-${viewRef.current.tab}`))?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []];
    const current = items.findIndex(item => item === document.activeElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[index]?.focus();
  }

  const target = view.dialog;
  const title = target ? target.kind === "count" ? target.id ? "Stok sayımı" : "Yeni stok sayımı" : target.kind === "purchase" ? target.id ? "Satın alma" : "Yeni satın alma" : target.id ? "Depolar arası taşıma" : "Yeni depolar arası taşıma" : "";
  const operationProps = target ? { embedded: true, mode: target.id ? "detail" as const : "new" as const, resourceId: target.id, onStateChange: updateActivity, initialLocationId: target.locationId, initialVariantId: target.variantId } : null;

  return <PanelPageShell>
    <PanelPageHeader title="Stok" />
    <div className={styles.workspace}>
      <div className={styles.main}>
        <h1 className={styles.srOnly}>Stok</h1>
        <div className={styles.toolbar}>
          <div role="tablist" aria-label="Stok görünümü" className={styles.tabs}>
            {tabs.map((tab, index) => <button key={tab.id} id={`stock-tab-${tab.id}`} type="button" role="tab" aria-selected={view.tab === tab.id} aria-controls={`stock-panel-${tab.id}`} tabIndex={view.tab === tab.id ? 0 : -1} onClick={() => requestView({ tab: tab.id, dialog: null })} onKeyDown={event => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]!;
              requestView({ tab: next.id, dialog: null });
              document.getElementById(`stock-tab-${next.id}`)?.focus();
            }}>{tab.label}</button>)}
          </div>
          {hasActions ? <div ref={menu} className={styles.actionMenu} onKeyDown={menuKeys}>
            <button ref={action} type="button" className={styles.primary} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={() => setMenuOpen(current => !current)} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setMenuOpen(true); } }}>Stok işlemi<ChevronDown size={16} aria-hidden="true" /></button>
            {menuOpen ? <div role="menu" aria-label="Stok işlemleri" id={menuId} className={styles.menu}>
              {canPurchase ? <button type="button" role="menuitem" tabIndex={-1} onClick={() => open("purchase")}>Yeni satın alma</button> : null}
              {canCount ? <button type="button" role="menuitem" tabIndex={-1} onClick={() => open("count")}>Sayım yap</button> : null}
              {canCount ? <button type="button" role="menuitem" tabIndex={-1} onClick={() => open("transfer")}>Depolar arası taşı</button> : null}
            </div> : null}
          </div> : null}
        </div>
        {notice && !target ? <p className={styles.notice} role="status">{notice}</p> : null}
        {selected ? tabs.map(tab => <section key={tab.id} className={styles.content} id={`stock-panel-${tab.id}`} role="tabpanel" aria-labelledby={`stock-tab-${tab.id}`} tabIndex={view.tab === tab.id ? 0 : undefined} hidden={view.tab !== tab.id}>{view.tab === tab.id ? <>
          {view.tab === "overview" ? <StockOverview canManage={canCount} canPurchase={canPurchase} onCorrect={selection => open("count", selection)} onPurchase={selection => open("purchase", selection)} /> : null}
          {view.tab === "counts" ? <InventoryCountConsole key={`counts-${listRevision}`} embedded canRead={props.canReadInventory} canManage={props.canManageInventory} /> : null}
          {view.tab === "transfers" ? <InventoryTransferConsole key={`transfers-${listRevision}`} embedded canRead={props.canReadInventory} canManage={props.canManageInventory} /> : null}
          {view.tab === "purchases" ? <PurchasingConsole key={`purchases-${listRevision}`} embedded canRead={props.canReadPurchasing} canManage={props.canManagePurchasing} /> : null}
          {view.tab === "locations" ? <InventoryLocationConsole key={`locations-${listRevision}`} embedded canRead={props.canReadInventory} canManage={props.canManageInventory} onStateChange={updateLocationActivity} /> : null}
        </> : null}</section>) : <p className={styles.notice} role="status">Stok kayıtlarını görüntüleme yetkiniz yok.</p>}
      </div>
      {target && operationProps ? <div ref={backdrop} className={styles.backdrop}>
        <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-busy={activity.pending} tabIndex={-1} className={styles.dialog} onKeyDown={dialogKeys}>
          <header className={styles.dialogHeader}><h2 id={headingId}>{title}</h2><button type="button" aria-label="Stok işlemini kapat" className={styles.close} disabled={protectedDialog} onClick={() => requestView({ tab: view.tab, dialog: null }, true)}><X size={20} aria-hidden="true" /></button></header>
          {notice ? <p className={styles.dialogNotice} role="status">{notice}</p> : null}
          {discardTarget ? <div className={styles.discard} role="group" aria-label="Kaydedilmemiş değişiklikler"><p>Kaydedilmemiş değişiklikler var. Bu pencereden çıkarsanız düzenlemeleriniz silinir.</p><div><button type="button" onClick={() => { setDiscardTarget(null); dialog.current?.focus(); }}>Düzenlemeye devam et</button><button type="button" disabled={protectedDialog} onClick={() => { if (activityRef.current.pending || activityRef.current.locked) return; const next = discardTarget; applyView(next); router.replace(viewHref(next), { scroll: false }); }}>Değişiklikleri bırak</button></div></div> : null}
          <div className={styles.dialogBody} key={activeKey}>
            {target.kind === "count" ? <InventoryCountConsole {...operationProps} canRead={props.canReadInventory} canManage={props.canManageInventory} /> : target.kind === "purchase" ? <PurchasingConsole {...operationProps} canRead={props.canReadPurchasing} canManage={props.canManagePurchasing} /> : <InventoryTransferConsole {...operationProps} canRead={props.canReadInventory} canManage={props.canManageInventory} />}
          </div>
        </div>
      </div> : null}
    </div>
  </PanelPageShell>;
}

export function StockWorkspace(props: StockWorkspaceProps) {
  return <InventoryWorkspaceProvider inventoryCanRead={props.canReadInventory}><StockWorkspaceBody {...props} /></InventoryWorkspaceProvider>;
}
