import type {
  InventoryCount,
  InventoryLocation,
  InventoryMutationResult,
  InventoryTransfer,
  PurchaseOrder,
} from "@celebix/saas-contracts";

import {
  InventoryApiError,
  type ReceivePurchaseOrderIntent,
  type SaveInventoryCountIntent,
  type SaveInventoryTransferIntent,
  type SavePurchaseOrderIntent,
  type inventoryApi,
} from "./client.ts";

export type InventoryConsolePhase =
  | "loading"
  | "loaded"
  | "submitting"
  | "committed"
  | "replayed"
  | "mutation_rejected"
  | "verification_unavailable"
  | "conflict"
  | "error"
  | "denied";

export interface InventoryConsoleSnapshot<RecordType> {
  readonly phase: InventoryConsolePhase;
  readonly record?: RecordType;
  readonly pending: boolean;
  readonly locked: boolean;
  readonly message: string;
}

export interface InventoryLocationConsoleSnapshot {
  readonly phase: InventoryConsolePhase;
  readonly items: readonly InventoryLocation[];
  readonly pending: boolean;
  readonly locked: boolean;
  readonly message: string;
}

type Change<RecordType> = (snapshot: InventoryConsoleSnapshot<RecordType>) => void;
type Resource = Readonly<{ id: string; status: string; version: number }>;

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isDefinitiveRejection(error: unknown): error is InventoryApiError {
  return error instanceof InventoryApiError && error.code !== "unavailable";
}

function isDenied(error: unknown): error is InventoryApiError {
  return error instanceof InventoryApiError && (error.code === "forbidden" || error.code === "unauthenticated");
}

function createController<RecordType extends Resource>(options: Readonly<{
  initial?: RecordType;
  resourceId?: string;
  canRead?: boolean;
  canManage: boolean;
  load: (id: string, signal?: AbortSignal) => Promise<RecordType>;
  onChange?: Change<RecordType>;
}>) {
  const createMode = options.initial === undefined && options.resourceId === undefined;
  let disposed = false;
  let busy = false;
  let sequence = 0;
  let request: AbortController | undefined;
  let active: Promise<void> | undefined;
  let snapshot: InventoryConsoleSnapshot<RecordType> = Object.freeze({
    phase: options.canRead === false ? "denied" : options.initial || createMode ? "loaded" : "loading",
    ...(options.initial ? { record: options.initial } : {}),
    pending: false,
    locked: false,
    message: options.canRead === false ? "Bu envanter kaydını görüntüleme yetkiniz yok." : "",
  });

  function publish(next: InventoryConsoleSnapshot<RecordType>) {
    if (disposed) return;
    snapshot = Object.freeze(next);
    options.onChange?.(snapshot);
  }

  function current(value: number) {
    return !disposed && value === sequence;
  }

  async function reload(id: string, signal: AbortSignal) {
    const canonical = await options.load(id, signal);
    if (canonical.id !== id) throw new Error("inventory_canonical_resource_mismatch");
    return canonical;
  }

  async function load() {
    if (disposed || options.canRead === false || busy || snapshot.record || createMode) return;
    if (!options.resourceId) {
      publish({ phase: "error", pending: false, locked: false, message: "Envanter kaydı yüklenemedi." });
      return;
    }
    busy = true;
    request = new AbortController();
    const selected = ++sequence;
    publish({ phase: "loading", pending: false, locked: false, message: "" });
    try {
      const record = await reload(options.resourceId, request.signal);
      if (current(selected)) publish({ phase: "loaded", record, pending: false, locked: false, message: "" });
    } catch (error) {
      if (current(selected) && !isAbort(error)) publish({ phase: "error", pending: false, locked: false, message: "Envanter kaydı yüklenemedi. Tekrar deneyin." });
    } finally {
      if (current(selected)) { busy = false; request = undefined; }
    }
  }

  function mutate(execute: (record: RecordType | undefined, signal: AbortSignal) => Promise<InventoryMutationResult>) {
    if (disposed || options.canRead === false || !options.canManage || busy || snapshot.locked) return active ?? Promise.resolve();
    const record = snapshot.record;
    busy = true;
    request = new AbortController();
    const selected = ++sequence;
    publish({ phase: "submitting", record, pending: true, locked: true, message: "İşlem kalıcı envanter kaydına gönderiliyor…" });
    active = (async () => {
      let result: InventoryMutationResult;
      try {
        result = await execute(record, request!.signal);
      } catch (error) {
        if (!current(selected)) return;
        try {
          if (isDenied(error)) {
            publish({ phase: "denied", ...(record ? { record } : {}), pending: false, locked: true, message: "Bu envanter işlemi için yetkiniz yok. Oturum ve mağaza yetkilerinizi yeniden doğrulayın." });
          } else if (!record) {
            if (!isDefinitiveRejection(error)) {
              publish({ phase: "verification_unavailable", pending: false, locked: true, message: "Yeni kayıt işleminin sonucu doğrulanamadı. Yeni işlem göndermeyin; sayfayı tamamen yenileyin." });
            } else {
              publish({ phase: "mutation_rejected", pending: false, locked: false, message: "Yeni kayıt işlemi uygulanmadı. Alanları kontrol edip tekrar deneyebilirsiniz." });
            }
          } else {
            const canonical = await reload(record.id, request!.signal);
            if (!current(selected)) return;
            if (!isDefinitiveRejection(error)) {
              publish({ phase: "verification_unavailable", record: canonical, pending: false, locked: true, message: "İşlem sonucu belirsiz. Güncel kalıcı kayıt gösteriliyor ancak bu işlemin uygulanıp uygulanmadığı doğrulanamadı; yeni işlem göndermeyin, sayfayı yeniden yükleyin." });
            } else if (canonical.version === record.version && canonical.status === record.status) {
              publish({ phase: "mutation_rejected", record: canonical, pending: false, locked: false, message: "İşlem uygulanmadı; kalıcı kayıt değişmedi. Yeni bir işlem kimliğiyle tekrar deneyebilirsiniz." });
            } else {
              publish({ phase: "conflict", record: canonical, pending: false, locked: true, message: error.code === "conflict" ? "Kayıt başka bir işlem tarafından değiştirildi. Güncel kalıcı sürüm yüklendi." : "İşlem kesin olarak reddedildi ancak kalıcı kayıt değişti. Güncel sürüm yüklendi." });
            }
          }
        } catch {
          if (current(selected)) publish({ phase: "verification_unavailable", ...(record ? { record } : {}), pending: false, locked: true, message: "İşlem sonucu doğrulanamadı. Yeni işlem göndermeyin; sayfayı yeniden yükleyin." });
        } finally {
          if (current(selected)) { busy = false; request = undefined; active = undefined; }
        }
        return;
      }
      if (!current(selected)) return;
      try {
        const canonical = await reload(result.id, request!.signal);
        if (!current(selected)) return;
        if (canonical.version < result.version || canonical.status !== result.status) {
          publish({ phase: "conflict", record: canonical, pending: false, locked: true, message: "İşlem yanıtlandı ancak kalıcı kayıt farklı bir sürüme ilerledi. Güncel kalıcı durum gösteriliyor." });
          return;
        }
        publish({
          phase: result.replayed ? "replayed" : "committed",
          record: canonical,
          pending: false,
          locked: false,
          message: result.replayed ? "Daha önce tamamlanan işlem kalıcı kayıttan yeniden gösterildi." : "İşlem tamamlandı ve kalıcı kayıt yeniden yüklendi.",
        });
      } catch {
        if (current(selected)) publish({ phase: "verification_unavailable", ...(record ? { record } : {}), pending: false, locked: true, message: "İşlem yanıtlandı ancak kalıcı sonuç doğrulanamadı. Yeni işlem göndermeyin; sayfayı yeniden yükleyin." });
      } finally {
        if (current(selected)) { busy = false; request = undefined; active = undefined; }
      }
    })();
    return active;
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    load,
    submit(execute: (record: RecordType, signal: AbortSignal) => Promise<InventoryMutationResult>) {
      if (!snapshot.record) return active ?? Promise.resolve();
      return mutate((record, signal) => execute(record!, signal));
    },
    mutate,
    dispose() {
      if (disposed) return;
      disposed = true;
      sequence += 1;
      request?.abort();
      request = undefined;
      busy = false;
      active = undefined;
    },
  });
}

type LifecycleController = Readonly<{ load(): Promise<void>; dispose(): void }>;

export function createInventoryConsoleLifecycle<Controller extends LifecycleController>(factory: () => Controller) {
  let current: Controller | undefined;
  let generation = 0;
  return Object.freeze({
    setup() {
      const controller = factory();
      const selected = ++generation;
      current = controller;
      void controller.load();
      return () => {
        controller.dispose();
        if (generation === selected && current === controller) current = undefined;
      };
    },
    getCurrent() { return current; },
  });
}

type LocationApi = Pick<typeof inventoryApi, "listLocations" | "saveLocation" | "archiveLocation">;
export function createInventoryLocationConsoleController(options: Readonly<{
  canRead: boolean;
  canManage: boolean;
  api: LocationApi;
  onChange?: (snapshot: InventoryLocationConsoleSnapshot) => void;
}>) {
  let disposed = false, busy = false, sequence = 0;
  let request: AbortController | undefined, active: Promise<void> | undefined;
  let snapshot: InventoryLocationConsoleSnapshot = Object.freeze({
    phase: options.canRead ? "loading" : "denied", items: Object.freeze([]), pending: false, locked: false,
    message: options.canRead ? "" : "Konumları görüntüleme yetkiniz yok.",
  });
  const publish = (value: InventoryLocationConsoleSnapshot) => { if (!disposed) { snapshot = Object.freeze(value); options.onChange?.(snapshot); } };
  const current = (selected: number) => !disposed && selected === sequence;
  async function read(signal: AbortSignal) {
    const items = await options.api.listLocations(signal);
    return Object.freeze([...items]);
  }
  async function load() {
    if (disposed || !options.canRead || busy) return;
    busy = true; request = new AbortController(); const selected = ++sequence;
    publish({ phase: "loading", items: snapshot.items, pending: false, locked: false, message: "" });
    try {
      const items = await read(request.signal);
      if (current(selected)) publish({ phase: items.length ? "loaded" : "loaded", items, pending: false, locked: false, message: items.length ? "" : "Henüz ek konum yok." });
    } catch (error) {
      if (current(selected) && !isAbort(error)) publish({
        phase: error instanceof InventoryApiError && (error.code === "forbidden" || error.code === "unauthenticated") ? "denied" : "error",
        items: Object.freeze([]), pending: false, locked: false,
        message: error instanceof InventoryApiError && (error.code === "forbidden" || error.code === "unauthenticated") ? "Konumları görüntüleme yetkiniz yok." : "Konumlar yüklenemedi. Tekrar deneyin.",
      });
    } finally { if (current(selected)) { busy = false; request = undefined; } }
  }
  function mutate(run: (signal: AbortSignal) => Promise<InventoryMutationResult>) {
    if (disposed || !options.canRead || !options.canManage || busy || snapshot.locked) return active ?? Promise.resolve();
    busy = true; request = new AbortController(); const selected = ++sequence;
    publish({ ...snapshot, phase: "submitting", pending: true, locked: true, message: "Konum işlemi kalıcı kayda gönderiliyor…" });
    active = (async () => {
      let result: InventoryMutationResult;
      try { result = await run(request!.signal); }
      catch (error) {
        if (!current(selected)) return;
        if (isDenied(error)) {
          publish({ ...snapshot, phase: "denied", pending: false, locked: true, message: "Bu konum işlemi için yetkiniz yok. Oturum ve mağaza yetkilerinizi yeniden doğrulayın." });
        } else if (!isDefinitiveRejection(error)) {
          publish({ ...snapshot, phase: "verification_unavailable", pending: false, locked: true, message: "İşlem sonucu belirsiz. Yeni işlem göndermeyin; sayfayı tamamen yenileyin." });
        } else {
          try {
            const items = await read(request!.signal);
            if (!current(selected)) return;
            publish({ phase: error.code === "conflict" ? "conflict" : "mutation_rejected", items, pending: false, locked: error.code === "conflict", message: error.code === "conflict" ? "Konum başka bir işlem tarafından değiştirildi. Güncel sürüm gösteriliyor." : "Konum işlemi uygulanmadı." });
          } catch { if (current(selected)) publish({ ...snapshot, phase: "verification_unavailable", pending: false, locked: true, message: "İşlem sonucu doğrulanamadı. Sayfayı tamamen yenileyin." }); }
        }
        return;
      }
      if (!current(selected)) return;
      try {
        const items = await read(request!.signal), canonical = items.find((item) => item.id === result.id);
        if (!canonical || canonical.version < result.version || canonical.status !== result.status) {
          publish({ phase: "conflict", items, pending: false, locked: true, message: "Kalıcı konum sonucu beklenen sürümle eşleşmedi. Sayfayı yenileyin." }); return;
        }
        publish({ phase: result.replayed ? "replayed" : "committed", items, pending: false, locked: false, message: result.replayed ? "Daha önce tamamlanan konum işlemi kalıcı kayıttan gösterildi." : "Konum işlemi kalıcı olarak tamamlandı." });
      } catch { if (current(selected)) publish({ ...snapshot, phase: "verification_unavailable", pending: false, locked: true, message: "İşlem yanıtlandı ancak kalıcı sonuç doğrulanamadı. Sayfayı tamamen yenileyin." }); }
    })().finally(() => { if (current(selected)) { busy = false; request = undefined; active = undefined; } });
    return active;
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    load,
    save(value: Readonly<{ locationId?: string; expectedVersion?: number; name: string }>) { return mutate((signal) => options.api.saveLocation(value, signal)); },
    archive(location: InventoryLocation) {
      if (!location.archiveEligibility.canArchive) return Promise.resolve();
      return mutate((signal) => options.api.archiveLocation(location.id, location.version, signal));
    },
    dispose() { if (disposed) return; disposed = true; sequence += 1; request?.abort(); request = undefined; busy = false; active = undefined; },
  });
}

type PurchasingApi = Pick<typeof inventoryApi, "getPurchaseOrder" | "savePurchaseOrder" | "receivePurchaseOrder" | "transitionPurchaseOrder">;
export function createPurchasingConsoleController(options: Readonly<{
  initial?: PurchaseOrder;
  resourceId?: string;
  canRead?: boolean;
  canManage: boolean;
  api: PurchasingApi;
  onChange?: Change<PurchaseOrder>;
}>) {
  const controller = createController({ ...options, load: options.api.getPurchaseOrder.bind(options.api) });
  const allowed = (statuses: readonly PurchaseOrder["status"][], execute: (record: PurchaseOrder, signal: AbortSignal) => Promise<InventoryMutationResult>) => {
    const record = controller.getSnapshot().record;
    return record && statuses.includes(record.status) ? controller.submit(execute) : Promise.resolve();
  };
  return Object.freeze({
    getSnapshot: controller.getSnapshot,
    load: controller.load,
    save(value: SavePurchaseOrderIntent) {
      const record = controller.getSnapshot().record;
      if (
        (record && (record.status !== "draft" || value.orderId !== record.id || value.expectedVersion !== record.version)) ||
        (!record && (value.orderId !== undefined || value.expectedVersion !== undefined))
      ) return Promise.resolve();
      return controller.mutate((_record, signal) => options.api.savePurchaseOrder(value, signal));
    },
    receive(lines: ReceivePurchaseOrderIntent["lines"]) {
      const record = controller.getSnapshot().record;
      let safe = false;
      try {
        safe = Boolean(
          record && Array.isArray(lines) && lines.length >= 1 && lines.length <= 500 &&
          new Set(lines.map((line) => line.lineId)).size === lines.length &&
          lines.every((line) => {
            const persisted = record.lines.find((candidate) => candidate.id === line.lineId);
            return persisted !== undefined && Number.isSafeInteger(line.quantity) && line.quantity >= 1 &&
              line.quantity <= persisted.orderedQuantity - persisted.receivedQuantity;
          }),
        );
      } catch { safe = false; }
      if (!safe) return Promise.resolve();
      return allowed(["ordered", "partially_received"], (record, signal) => options.api.receivePurchaseOrder(record.id, {
          expectedVersion: record.version,
          locationId: record.locationId,
          lines,
        }, signal));
    },
    order() {
      return allowed(["draft"], (record, signal) => options.api.transitionPurchaseOrder(record.id, { expectedVersion: record.version, transition: "order" }, signal));
    },
    cancel() {
      return allowed(["draft", "ordered", "partially_received"], (record, signal) => options.api.transitionPurchaseOrder(record.id, { expectedVersion: record.version, transition: "cancel" }, signal));
    },
    dispose: controller.dispose,
  });
}

type CountApi = Pick<typeof inventoryApi, "getCount" | "saveCount" | "startCount" | "commitCount" | "cancelCount">;
export function createInventoryCountConsoleController(options: Readonly<{
  initial?: InventoryCount;
  resourceId?: string;
  canRead?: boolean;
  canManage: boolean;
  api: CountApi;
  onChange?: Change<InventoryCount>;
}>) {
  const controller = createController({ ...options, load: options.api.getCount.bind(options.api) });
  const allowed = (statuses: readonly InventoryCount["status"][], execute: (record: InventoryCount, signal: AbortSignal) => Promise<InventoryMutationResult>) => {
    const record = controller.getSnapshot().record;
    return record && statuses.includes(record.status) ? controller.submit(execute) : Promise.resolve();
  };
  return Object.freeze({
    getSnapshot: controller.getSnapshot,
    load: controller.load,
    save(value: SaveInventoryCountIntent) {
      const record = controller.getSnapshot().record;
      if (
        (record && (!["draft", "counting"].includes(record.status) || value.countId !== record.id || value.expectedVersion !== record.version)) ||
        (!record && (value.countId !== undefined || value.expectedVersion !== undefined))
      ) return Promise.resolve();
      return controller.mutate((_record, signal) => options.api.saveCount(value, signal));
    },
    start: () => allowed(["draft"], (record, signal) => options.api.startCount(record.id, record.version, signal)),
    commit: () => allowed(["counting"], (record, signal) => options.api.commitCount(record.id, record.version, signal)),
    cancel: () => allowed(["draft", "counting"], (record, signal) => options.api.cancelCount(record.id, record.version, signal)),
    dispose: controller.dispose,
  });
}

type TransferApi = Pick<typeof inventoryApi, "getTransfer" | "saveTransfer" | "dispatchTransfer" | "receiveTransfer" | "cancelTransfer">;
export function createInventoryTransferConsoleController(options: Readonly<{
  initial?: InventoryTransfer;
  resourceId?: string;
  canRead?: boolean;
  canManage: boolean;
  api: TransferApi;
  onChange?: Change<InventoryTransfer>;
}>) {
  const controller = createController({ ...options, load: options.api.getTransfer.bind(options.api) });
  const allowed = (statuses: readonly InventoryTransfer["status"][], execute: (record: InventoryTransfer, signal: AbortSignal) => Promise<InventoryMutationResult>) => {
    const record = controller.getSnapshot().record;
    return record && statuses.includes(record.status) ? controller.submit(execute) : Promise.resolve();
  };
  return Object.freeze({
    getSnapshot: controller.getSnapshot,
    load: controller.load,
    save(value: SaveInventoryTransferIntent) {
      const record = controller.getSnapshot().record;
      if (
        (record && (record.status !== "draft" || value.transferId !== record.id || value.expectedVersion !== record.version)) ||
        (!record && (value.transferId !== undefined || value.expectedVersion !== undefined))
      ) return Promise.resolve();
      return controller.mutate((_record, signal) => options.api.saveTransfer(value, signal));
    },
    dispatch: () => allowed(["draft"], (record, signal) => options.api.dispatchTransfer(record.id, record.version, signal)),
    receive: () => allowed(["in_transit"], (record, signal) => options.api.receiveTransfer(record.id, record.version, signal)),
    cancel: () => allowed(["draft", "in_transit"], (record, signal) => options.api.cancelTransfer(record.id, record.version, signal)),
    dispose: controller.dispose,
  });
}
