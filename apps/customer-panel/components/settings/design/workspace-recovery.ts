import { normalizeStorefrontDesignDocumentV5, type HomepageSectionId, type StorefrontDesignDocument } from "@celebix/saas-contracts";
import { DESIGN_CANVAS_SURFACES, type DesignCanvasSurface } from "./design-surface-model.ts";
import { applyDesignEdit, type DesignApplyToken, type DesignEditorState } from "./workspace-model.ts";

export type DesignRecoveryLocation = { kind: "surface"; surface: DesignCanvasSurface } | { kind: "insert"; index: number } | { kind: "section"; sectionId: HomepageSectionId } | { kind: "order" };
export type DesignRecoveryEntry = Readonly<{ schemaVersion: 1; baseVersion: number; savedAt: number; design: StorefrontDesignDocument; location: DesignRecoveryLocation; pending?: DesignApplyToken; conflicted?: boolean }>;
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const MAX_LENGTH = 512_000;
const MAX_AGE = 86_400_000;
const keyFor = (scope?: string) => scope && scope.length <= 256 ? `celebix:design-recovery:v1:${scope}` : null;
const sameDesign = (a: StorefrontDesignDocument, b: StorefrontDesignDocument) => JSON.stringify(a) === JSON.stringify(b);

function validLocation(value: unknown): value is DesignRecoveryLocation {
 if (!value || typeof value !== "object") return false;
 const location = value as Record<string, unknown>;
 return location.kind === "order" ||
  (location.kind === "surface" && DESIGN_CANVAS_SURFACES.some(surface => surface.key === location.surface)) ||
  (location.kind === "section" && typeof location.sectionId === "string" && /^home_[a-zA-Z0-9_-]{1,120}$/.test(location.sectionId)) ||
  (location.kind === "insert" && Number.isInteger(location.index) && Number(location.index) >= 0 && Number(location.index) <= 100);
}

export function createDesignRecovery(state: DesignEditorState, location: DesignRecoveryLocation, now: number): DesignRecoveryEntry | null {
 if (state.status === "applied" || sameDesign(state.design, state.baseline)) return null;
 try {
  const design=normalizeStorefrontDesignDocumentV5(state.design);
  return { schemaVersion: 1, baseVersion: state.publishedVersion, savedAt: now, design, location, ...(state.pending ? { pending: state.pending } : {}), ...(state.status==="conflict"?{conflicted:true}:{}) };
 } catch { return null; }
}

export function writeDesignRecovery(scope: string | undefined, entry: DesignRecoveryEntry, storage: RecoveryStorage): boolean {
 const key = keyFor(scope);
 if (!key) return false;
 try {
  const value = JSON.stringify(entry);
  if (value.length > MAX_LENGTH) return false;
  storage.setItem(key, value);
  return true;
 } catch { return false; }
}

export function readDesignRecovery(scope: string | undefined, storage: RecoveryStorage, now: number): DesignRecoveryEntry | null {
 const key = keyFor(scope);
 if (!key) return null;
 try {
  const value = storage.getItem(key);
  if (!value || value.length > MAX_LENGTH) return null;
  const entry = JSON.parse(value) as Record<string, unknown>;
  if (entry.schemaVersion !== 1 || !Number.isSafeInteger(entry.baseVersion) || Number(entry.baseVersion) < 1 ||
   typeof entry.savedAt !== "number" || !Number.isFinite(entry.savedAt) || entry.savedAt > now + 60_000 || now - entry.savedAt > MAX_AGE || !validLocation(entry.location)) return null;
  const design = normalizeStorefrontDesignDocumentV5(entry.design);
  let pending: DesignApplyToken | undefined;
  if (entry.pending !== undefined) {
   const token = entry.pending as DesignApplyToken;
   if (!token || typeof token.operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token.operationId) ||
    token.expectedPublishedVersion !== entry.baseVersion || !Number.isSafeInteger(token.revision) || token.revision < 0) return null;
   const pendingDesign = normalizeStorefrontDesignDocumentV5(token.design);
   if (!sameDesign(pendingDesign, design)) return null;
   pending = { ...token, design: pendingDesign };
  }
  if(entry.conflicted!==undefined&&typeof entry.conflicted!=="boolean")return null;
  return { schemaVersion: 1, baseVersion: Number(entry.baseVersion), savedAt: entry.savedAt, location: entry.location, design, ...(pending ? { pending } : {}), ...(entry.conflicted?{conflicted:true}:{}) };
 } catch { return null; }
}

export function clearDesignRecovery(scope: string | undefined, storage: RecoveryStorage): boolean {
 const key = keyFor(scope);
 if (!key) return false;
 try { storage.removeItem(key); return true; } catch { return false; }
}

export function restoreDesignRecovery(current: DesignEditorState, entry: DesignRecoveryEntry): DesignEditorState {
 const restored = applyDesignEdit(current, entry.design);
 if (entry.conflicted || entry.baseVersion !== current.publishedVersion) return { ...restored, status: "conflict", pending: undefined };
 return entry.pending ? { ...restored, status: "error", pending: { ...entry.pending, revision: restored.revision } } : restored;
}

// Only public design content is persisted. The server-derived opaque scope binds
// it to this login and store; storage content is never an authorization source.
export function designRecoveryStorage(): RecoveryStorage | null {
 try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
