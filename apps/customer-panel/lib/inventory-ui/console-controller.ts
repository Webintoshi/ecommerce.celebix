import type {
  InventoryCount,
  InventoryMutationResult,
  InventoryTransfer,
  PurchaseOrder,
} from "@celebix/saas-contracts";

import type { inventoryApi } from "./client.ts";

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

type Change<RecordType> = (snapshot: InventoryConsoleSnapshot<RecordType>) => void;
type Resource = Readonly<{ id: string; status: string; version: number }>;

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "conflict";
}

function createController<RecordType extends Resource>(options: Readonly<{
  initial?: RecordType;
  resourceId?: string;
  canRead?: boolean;
  canManage: boolean;
  load: (id: string, signal?: AbortSignal) => Promise<RecordType>;
  onChange?: Change<RecordType>;
}>) {
  let disposed = false;
  let busy = false;
  let sequence = 0;
  let request: AbortController | undefined;
  let active: Promise<void> | undefined;
  let snapshot: InventoryConsoleSnapshot<RecordType> = Object.freeze({
    phase: options.canRead === false ? "denied" : options.initial ? "loaded" : "loading",
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
    if (disposed || options.canRead === false || busy || snapshot.record) return;
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

  function submit(execute: (record: RecordType, signal: AbortSignal) => Promise<InventoryMutationResult>) {
    if (disposed || options.canRead === false || !options.canManage || busy || snapshot.locked || !snapshot.record) return active ?? Promise.resolve();
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
        if (!current(selected) || isAbort(error)) return;
        try {
          const canonical = await reload(record.id, request!.signal);
          if (!current(selected)) return;
          if (canonical.version === record.version && canonical.status === record.status) {
            publish({ phase: "mutation_rejected", record: canonical, pending: false, locked: false, message: "İşlem uygulanmadı; kalıcı kayıt değişmedi. Yeni bir işlem kimliğiyle tekrar deneyebilirsiniz." });
          } else {
            publish({ phase: "conflict", record: canonical, pending: false, locked: true, message: isConflict(error) ? "Kayıt başka bir işlem tarafından değiştirildi. Güncel kalıcı sürüm yüklendi." : "İşlem sonucu belirsizdi; kalıcı kaydın değiştiği doğrulandı ve güncel sürüm yüklendi." });
          }
        } catch (reloadError) {
          if (current(selected) && !isAbort(reloadError)) publish({ phase: "verification_unavailable", record, pending: false, locked: true, message: "İşlem sonucu doğrulanamadı. Yeni işlem göndermeyin; sayfayı yeniden yükleyin." });
        } finally {
          if (current(selected)) { busy = false; request = undefined; active = undefined; }
        }
        return;
      }
      if (!current(selected)) return;
      try {
        const canonical = await reload(record.id, request!.signal);
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
      } catch (error) {
        if (current(selected) && !isAbort(error)) publish({ phase: "verification_unavailable", record, pending: false, locked: true, message: "İşlem yanıtlandı ancak kalıcı sonuç doğrulanamadı. Yeni işlem göndermeyin; sayfayı yeniden yükleyin." });
      } finally {
        if (current(selected)) { busy = false; request = undefined; active = undefined; }
      }
    })();
    return active;
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    load,
    submit,
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

type PurchasingApi = Pick<typeof inventoryApi, "getPurchaseOrder" | "receivePurchaseOrder" | "transitionPurchaseOrder">;
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
    receive() {
      return allowed(["ordered", "partially_received"], (record, signal) => options.api.receivePurchaseOrder(record.id, {
          expectedVersion: record.version,
          locationId: record.locationId,
          lines: record.lines.flatMap((line) => line.orderedQuantity > line.receivedQuantity
            ? [{ lineId: line.id, quantity: line.orderedQuantity - line.receivedQuantity }]
            : []),
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

type CountApi = Pick<typeof inventoryApi, "getCount" | "startCount" | "commitCount" | "cancelCount">;
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
    start: () => allowed(["draft"], (record, signal) => options.api.startCount(record.id, record.version, signal)),
    commit: () => allowed(["counting"], (record, signal) => options.api.commitCount(record.id, record.version, signal)),
    cancel: () => allowed(["draft", "counting"], (record, signal) => options.api.cancelCount(record.id, record.version, signal)),
    dispose: controller.dispose,
  });
}

type TransferApi = Pick<typeof inventoryApi, "getTransfer" | "dispatchTransfer" | "receiveTransfer" | "cancelTransfer">;
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
    dispatch: () => allowed(["draft"], (record, signal) => options.api.dispatchTransfer(record.id, record.version, signal)),
    receive: () => allowed(["in_transit"], (record, signal) => options.api.receiveTransfer(record.id, record.version, signal)),
    cancel: () => allowed(["draft", "in_transit"], (record, signal) => options.api.cancelTransfer(record.id, record.version, signal)),
    dispose: controller.dispose,
  });
}
