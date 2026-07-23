import type {
  CatalogAdminMutationResult,
  CatalogImportFormat,
  CatalogImportPreview,
} from "@celebix/saas-contracts";

const MAX_FILE_BYTES = 131_072;

export interface CatalogImportPreparationFile {
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface CatalogImportPreparationApi {
  prepareImportPreview(
    input: Readonly<{ format: CatalogImportFormat; fileName: string; content: string }>,
    signal?: AbortSignal,
  ): Promise<CatalogImportPreview>;
  getImportPreview(previewId: string, signal?: AbortSignal): Promise<CatalogImportPreview>;
  commitImportPreview(
    previewId: string,
    expectedVersion: number,
    signal?: AbortSignal,
  ): Promise<CatalogAdminMutationResult>;
}

export type CatalogImportPreparationPhase =
  | "idle"
  | "preparing"
  | "prepared"
  | "committing"
  | "verifying"
  | "consumed"
  | "mutation_rejected"
  | "verification_unavailable"
  | "error";

export interface CatalogImportPreparationSnapshot {
  readonly phase: CatalogImportPreparationPhase;
  readonly preview?: CatalogImportPreview;
  readonly error: string;
  readonly notice: string;
  readonly canCommit: boolean;
  readonly commitLocked: boolean;
}

export const EMPTY_CATALOG_IMPORT_PREPARATION_SNAPSHOT: CatalogImportPreparationSnapshot = Object.freeze({
  phase: "idle",
  error: "",
  notice: "",
  canCommit: false,
  commitLocked: false,
});

type Options = Readonly<{
  api: CatalogImportPreparationApi;
  canImport: boolean;
  format: CatalogImportFormat;
  now?: () => number;
  onChange?: (snapshot: CatalogImportPreparationSnapshot) => void;
}>;

function isPreparedAndUnexpired(preview: CatalogImportPreview | undefined, now: number) {
  return Boolean(preview && preview.status === "prepared" && Date.parse(preview.expiresAt) > now);
}

function isAbort(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}

function decodeCatalogImportCsv(bytes: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("catalog_import_csv_invalid");
  }
}

export function createCatalogImportPreparationController({
  api,
  canImport,
  format,
  now = Date.now,
  onChange,
}: Options) {
  let activeRequest: AbortController | undefined;
  let busy = false;
  let commitLocked = false;
  let disposed = false;
  let sequence = 0;
  let snapshot = EMPTY_CATALOG_IMPORT_PREPARATION_SNAPSHOT;

  function current(request: number) {
    return !disposed && sequence === request;
  }

  function publish(next: Omit<CatalogImportPreparationSnapshot, "canCommit" | "commitLocked">) {
    if (disposed) return;
    snapshot = Object.freeze({
      ...next,
      canCommit: canImport && !busy && !commitLocked && isPreparedAndUnexpired(next.preview, now()),
      commitLocked,
    });
    onChange?.(snapshot);
  }

  function begin() {
    activeRequest?.abort();
    activeRequest = new AbortController();
    sequence += 1;
    return { controller: activeRequest, request: sequence };
  }

  function finish(request: number) {
    if (!current(request)) return;
    busy = false;
    activeRequest = undefined;
    publish(snapshot);
  }

  function verificationUnavailable(preview: CatalogImportPreview, request: number) {
    if (!current(request)) return;
    commitLocked = true;
    publish({
      phase: "verification_unavailable",
      preview,
      error: "",
      notice: "Aktarım sonucu doğrulanamadı. Yeniden aktarmayın; kalıcı durum doğrulanana kadar bu önizleme kilitlendi.",
    });
  }

  function applyVerification(
    canonical: CatalogImportPreview,
    target: CatalogImportPreview,
    request: number,
    mutationResolved: boolean,
  ) {
    if (!current(request)) return;
    if (canonical.id !== target.id) {
      verificationUnavailable(target, request);
      return;
    }
    if (canonical.status === "consumed") {
      commitLocked = true;
      publish({
        phase: "consumed",
        preview: canonical,
        error: "",
        notice: `${canonical.totalRows} ürün kalıcı kataloğa aktarıldı.`,
      });
      return;
    }
    if (!mutationResolved && isPreparedAndUnexpired(canonical, now())) {
      commitLocked = false;
      publish({
        phase: "mutation_rejected",
        preview: canonical,
        error: "Aktarım isteği uygulanmadı. Kalıcı önizleme hâlâ hazırlanmış durumda; tekrar deneyebilirsiniz.",
        notice: "",
      });
      return;
    }
    verificationUnavailable(canonical, request);
  }

  async function verify(
    target: CatalogImportPreview,
    controller: AbortController,
    request: number,
    mutationResolved: boolean,
  ) {
    if (!current(request)) return;
    publish({ phase: "verifying", preview: target, error: "", notice: "Aktarımın kalıcı durumu doğrulanıyor…" });
    try {
      const canonical = await api.getImportPreview(target.id, controller.signal);
      applyVerification(canonical, target, request, mutationResolved);
    } catch (caught) {
      if (current(request) && !isAbort(caught)) verificationUnavailable(target, request);
    }
  }

  return Object.freeze({
    getSnapshot() {
      return snapshot;
    },
    refreshClock() {
      if (!disposed) publish(snapshot);
    },
    resetSelection() {
      if (disposed) return;
      sequence += 1;
      activeRequest?.abort();
      activeRequest = undefined;
      busy = false;
      commitLocked = false;
      snapshot = EMPTY_CATALOG_IMPORT_PREPARATION_SNAPSHOT;
      onChange?.(snapshot);
    },
    async prepare(file: CatalogImportPreparationFile) {
      if (disposed || !canImport || busy) return;
      if (file.size < 1 || file.size > MAX_FILE_BYTES || !file.name.toLowerCase().endsWith(".csv")) {
        publish({ phase: "error", error: "En fazla 128 KB boyutunda geçerli bir CSV dosyası seçin.", notice: "" });
        return;
      }
      busy = true;
      commitLocked = false;
      publish({ phase: "preparing", error: "", notice: "Önizleme oluşturuluyor…" });
      const { controller, request } = begin();
      let bytes: ArrayBuffer | undefined;
      let content = "";
      try {
        bytes = await file.arrayBuffer();
        if (!current(request)) return;
        try {
          content = decodeCatalogImportCsv(bytes);
        } finally {
          bytes = undefined;
        }
        if (!current(request)) return;
        const prepared = await api.prepareImportPreview({ format, fileName: file.name, content }, controller.signal);
        content = "";
        if (!current(request)) return;
        const canonical = await api.getImportPreview(prepared.id, controller.signal);
        if (!current(request)) return;
        if (canonical.id !== prepared.id) throw new Error("catalog_import_preview_mismatch");
        commitLocked = canonical.status !== "prepared";
        publish({
          phase: canonical.status === "prepared" ? "prepared" : canonical.status === "consumed" ? "consumed" : "error",
          preview: canonical,
          error: canonical.status === "expired" ? "Bu önizlemenin süresi doldu. Yeni bir önizleme oluşturun." : "",
          notice: canonical.status === "prepared" ? "Önizleme hazır. Katalog henüz değiştirilmedi." : "",
        });
      } catch (caught) {
        if (current(request) && !isAbort(caught)) {
          commitLocked = true;
          publish({ phase: "error", error: "CSV önizlemesi oluşturulamadı.", notice: "" });
        }
      } finally {
        bytes = undefined;
        content = "";
        finish(request);
      }
    },
    async commit() {
      const target = snapshot.preview;
      if (disposed || !canImport || busy || commitLocked || !isPreparedAndUnexpired(target, now())) return;
      if (!target) return;
      busy = true;
      commitLocked = true;
      publish({ phase: "committing", preview: target, error: "", notice: "Aktarım isteği gönderiliyor…" });
      const { controller, request } = begin();
      try {
        await api.commitImportPreview(target.id, target.version, controller.signal);
        await verify(target, controller, request, true);
      } catch (caught) {
        if (current(request) && !isAbort(caught)) await verify(target, controller, request, false);
      } finally {
        finish(request);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sequence += 1;
      activeRequest?.abort();
      activeRequest = undefined;
      busy = false;
    },
  });
}
