"use client";

import {
  Archive, ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, CircleCheck,
  FolderTree, GripVertical, ImageOff, ImagePlus, MoreHorizontal, Plus, RefreshCw,
  Search, Trash2, X,
} from "lucide-react";
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type FormEvent, type KeyboardEvent,
} from "react";
import { parseStorefrontAsset, type CatalogCategory, type PermanentDeletionImpact, type StorefrontAsset } from "@celebix/saas-contracts";

import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { buildCatalogCategoryHierarchy, type CatalogCategoryTreeRow } from "@/lib/catalog-onboarding-ui/category-tree";
import { buildChangedCategoryOrderGroups, moveCategoryAmongSiblings } from "@/lib/catalog-onboarding-ui/category-interactions";
import { categorySeoClient, EMPTY_CATEGORY_SEO, type CategorySeoDraft, type CategorySeoState } from "@/lib/catalog-onboarding-ui/category-seo";
import { PermanentDeleteDialog } from "@/components/shared/PermanentDeleteDialog";
import { CategoryMediaField } from "./CategoryMediaField";
import styles from "./category-management.module.css";

type EditorMode = Readonly<
  | { kind: "create"; parentId?: string }
  | { kind: "edit"; categoryId: string }
>;
type CategoryDraft = Readonly<{
  name: string; parentId: string; position: string; imageAssetId?: string; imageAltText: string;
}>;
type ViewFilter = "all" | "missing" | "archived";
type Confirmation = Readonly<{ title: string; description: string; label: string }>;
export type CategoryManagerApi = Pick<typeof catalogOnboardingClient,
  "listCategories" | "createCategory" | "updateCategory" | "archiveCategory" | "reorderCategories" | "getCategoryDeletionImpact" | "deleteCategory"
>;

function message(error: unknown) {
  if (error instanceof CatalogOnboardingApiError) {
    if (error.code === "version_conflict") return "Kategori sizden önce değiştirildi. Listeyi yenileyip tekrar deneyin.";
    if (error.code === "invalid_input") return "Kategori bilgilerini kontrol edin.";
    return error.message;
  }
  return "Kategori işlemi tamamlanamadı. Yeniden deneyin.";
}
function normalizeSearch(value: string) { return value.trim().toLocaleLowerCase("tr-TR"); }
function draftFor(category?: CatalogCategory, parentId?: string, position = 1): CategoryDraft {
  return Object.freeze({
    name: category?.name ?? "", parentId: category?.parentId ?? parentId ?? "",
    position: String(category?.position ?? position),
    ...(category?.image ? { imageAssetId: category.image.assetId } : {}),
    imageAltText: category?.image?.altText ?? "",
  });
}
function snapshot(draft: CategoryDraft) { return JSON.stringify(draft); }
function compare(left: CatalogCategory, right: CatalogCategory) {
  return left.position - right.position || left.name.localeCompare(right.name, "tr-TR") || left.id.localeCompare(right.id);
}

function inertOutside(element: HTMLElement) {
  const previous: Array<Readonly<{ element: HTMLElement; inert: boolean }>> = [];
  let branch: HTMLElement | null = element;
  while (branch?.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      if (sibling === branch || !(sibling instanceof HTMLElement) || sibling.hasAttribute("data-category-scrim")) continue;
      previous.push({ element: sibling, inert: sibling.inert });
      sibling.inert = true;
    }
    branch = branch.parentElement;
    if (branch === document.body) break;
  }
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => { for (const item of previous) item.element.inert = item.inert; document.body.style.overflow = overflow; };
}

function CategoryParentPicker({ disabled, value, rows, onChange }: Readonly<{
  disabled: boolean; value: string; rows: readonly CatalogCategoryTreeRow<CatalogCategory>[];
  onChange: (value: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const normalizedQuery = normalizeSearch(query);
  const visibleRows = normalizedQuery ? rows.filter(({ label }) => normalizeSearch(label).includes(normalizedQuery)) : rows;
  const selected = rows.find(({ category }) => category.id === value);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function select(next: string) { onChange(next); setOpen(false); setQuery(""); triggerRef.current?.focus(); }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
    if (!open || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const options = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    const index = options.findIndex((option) => option === document.activeElement);
    options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
  }

  return <div className={styles.parentPicker} ref={rootRef} onKeyDown={keyDown}>
    <button ref={triggerRef} type="button" className={styles.parentPickerTrigger} aria-haspopup="listbox" aria-expanded={open} aria-label="Üst kategori seç" disabled={disabled} onClick={() => setOpen((current) => !current)}>
      <span><strong>{selected?.category.name ?? "Ana kategori"}</strong>{selected ? <small>{selected.label}</small> : null}</span><ChevronDown aria-hidden="true" />
    </button>
    {open ? <div className={styles.parentPickerPopover}>
      <div className={styles.parentPickerSearch}><Search aria-hidden="true" /><input autoFocus type="search" value={query} placeholder="Üst kategori ara" aria-label="Üst kategori ara" onChange={(event) => setQuery(event.currentTarget.value)} /></div>
      <div className={styles.parentPickerOptions} role="listbox" aria-label="Üst kategori seçenekleri">
        {!normalizedQuery || "ana kategori".includes(normalizedQuery) ? <button type="button" role="option" aria-selected={!value} className={styles.parentPickerOption} onClick={() => select("")}><span><strong>Ana kategori</strong></span>{!value ? <Check aria-hidden="true" /> : null}</button> : null}
        {visibleRows.map(({ category, depth, label }) => <button type="button" role="option" aria-selected={value === category.id} className={styles.parentPickerOption} style={{ "--picker-depth": depth } as CSSProperties} key={category.id} onClick={() => select(category.id)}><span><strong>{category.name}</strong><small>{label}</small></span>{value === category.id ? <Check aria-hidden="true" /> : null}</button>)}
        {visibleRows.length === 0 && normalizedQuery ? <p className={styles.parentPickerEmpty}>Sonuç bulunamadı.</p> : null}
      </div>
    </div> : null}
  </div>;
}

export function CategoryManager({
  canManage = false, canArchive = false, canDelete = false, canManageSeo = false, api = catalogOnboardingClient,
}: Readonly<{ canManage?: boolean; canArchive?: boolean; canDelete?: boolean; canManageSeo?: boolean; api?: CategoryManagerApi }>) {
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [assets, setAssets] = useState<readonly StorefrontAsset[]>([]);
  const [editor, setEditor] = useState<EditorMode>();
  const [draft, setDraft] = useState<CategoryDraft>();
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [listUnavailable, setListUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [mediaPending, setMediaPending] = useState(false);
  const [seoState, setSeoState] = useState<CategorySeoState>();
  const [seoDraft, setSeoDraft] = useState<CategorySeoDraft>(EMPTY_CATEGORY_SEO);
  const [seoBaseline, setSeoBaseline] = useState(JSON.stringify(EMPTY_CATEGORY_SEO));
  const [seoOpen, setSeoOpen] = useState(false);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoError, setSeoError] = useState("");
  const seoSequence = useRef(0);
  const draftVersionRef = useRef<number | undefined>(undefined);
  const [error, setError] = useState("");
  const [assetError, setAssetError] = useState("");
  const [notice, setNotice] = useState("");
  const [nameError, setNameError] = useState("");
  const [positionError, setPositionError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [menuId, setMenuId] = useState<string>();
  const [highlightedId, setHighlightedId] = useState<string>();
  const [sortSnapshot, setSortSnapshot] = useState<readonly CatalogCategory[]>();
  const [sortDraft, setSortDraft] = useState<readonly CatalogCategory[]>();
  const [dragId, setDragId] = useState<string>();
  const [dropId, setDropId] = useState<string>();
  const [sheet, setSheet] = useState(false);
  const [editorHeight, setEditorHeight] = useState<number>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [deleteTarget, setDeleteTarget] = useState<CatalogCategory>();
  const [deletionImpact, setDeletionImpact] = useState<PermanentDeletionImpact>();
  const [deleteError, setDeleteError] = useState("");
  const loadSequence = useRef(0);
  const editorNameRef = useRef<HTMLInputElement>(null);
  const editorPanelRef = useRef<HTMLElement>(null);
  const editorCloseRef = useRef<HTMLButtonElement>(null);
  const editorReturnFocusRef = useRef<HTMLElement | null>(null);
  const editorReturnCategoryRef = useRef<string | undefined>(undefined);
  const newCategoryButtonRef = useRef<HTMLButtonElement>(null);
  const sortToggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const confirmationResolverRef = useRef<((value: boolean) => void) | undefined>(undefined);
  const confirmationOriginRef = useRef<HTMLElement | null>(null);
  const confirmationCategoryRef = useRef<string | undefined>(undefined);
  const deleteLayerRef = useRef<HTMLDivElement>(null);
  const deleteOriginRef = useRef<HTMLElement | null>(null);
  const deleteOriginCategoryRef = useRef<string | undefined>(undefined);
  const deleteReturnFocusIdRef = useRef<string | undefined>(undefined);
  const deleteFallbackIdRef = useRef<string | undefined>(undefined);
  const deletionIntentRef = useRef<Readonly<{ categoryId: string; expectedVersion: number; confirmation: string; operationId: string }> | undefined>(undefined);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true); setError(""); setAssetError("");
    const results = await Promise.allSettled([
      api.listCategories(),
      (async () => {
        if (!canManage) return Object.freeze([]) as readonly StorefrontAsset[];
        const response = await fetch("/api/storefront-assets", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("category_assets_unavailable");
        const body = await response.json() as { assets?: unknown };
        if (!Array.isArray(body.assets) || body.assets.length > 64) throw new Error("category_assets_invalid");
        return Object.freeze(body.assets.map(parseStorefrontAsset).filter((asset) => asset.kind === "category" && asset.status === "active"));
      })(),
    ]);
    if (sequence !== loadSequence.current) return;
    if (results[0].status === "fulfilled") { setCategories(results[0].value); setListUnavailable(false); }
    else { setError(message(results[0].reason)); setListUnavailable(true); }
    if (results[1].status === "fulfilled") setAssets(results[1].value);
    else setAssetError("Kategori görselleri yüklenemedi.");
    setLoading(false);
  }, [api, canManage]);
  useEffect(() => { void load(); return () => { loadSequence.current += 1; }; }, [load]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1120px)");
    const update = () => setSheet(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const sorting = sortDraft !== undefined;
  const displayCategories = sortDraft ?? categories;
  const hierarchy = useMemo(() => buildCatalogCategoryHierarchy(displayCategories), [displayCategories]);
  const rowsById = useMemo(() => new Map(hierarchy.rows.map((row) => [row.category.id, row])), [hierarchy.rows]);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const childIdsByParent = useMemo(() => {
    const children = new Map<string, string[]>();
    for (const { category } of hierarchy.rows) {
      if (!category.parentId) continue;
      const branch = children.get(category.parentId) ?? []; branch.push(category.id); children.set(category.parentId, branch);
    }
    return children;
  }, [hierarchy.rows]);
  const selectedCategory = editor?.kind === "edit" ? categories.find((category) => category.id === editor.categoryId) : undefined;
  const archived = selectedCategory?.status === "archived";
  const readOnly = archived || !canManage;
  const parentLocked = Boolean(selectedCategory && categories.some((category) => category.parentId === selectedCategory.id && category.status === "active"));
  const unavailableParents = new Set(selectedCategory ? [selectedCategory.id, ...hierarchy.descendantIds(selectedCategory.id)] : []);
  const parentRows = hierarchy.rows.filter(({ category, depth }) => (readOnly && category.id === draft?.parentId)
    || (category.status === "active" && !unavailableParents.has(category.id) && depth < 8));
  const categoryDirty = Boolean(draft && snapshot(draft) !== baseline);
  const seoDirty = Boolean(canManageSeo && seoState && JSON.stringify(seoDraft) !== seoBaseline);
  const dirty = categoryDirty || seoDirty || mediaPending;
  const orderGroups = useMemo(() => sortSnapshot && sortDraft ? buildChangedCategoryOrderGroups(sortSnapshot, sortDraft) : [], [sortSnapshot, sortDraft]);
  const orderDirty = orderGroups.length > 0;
  const interactionBusy = busy || uploadBusy;
  const editorVisible = Boolean(editor && draft && !confirmation && !deleteTarget);
  const modalEditor = editorVisible && sheet;
  const normalizedQuery = normalizeSearch(query);
  const flat = Boolean(normalizedQuery || filter !== "all");
  const visibleRows = hierarchy.rows.filter(({ category, label }) => {
    if (filter === "missing" && (category.status !== "active" || category.image !== undefined)) return false;
    if (filter === "archived" && category.status !== "archived") return false;
    if (normalizedQuery && !normalizeSearch(label).includes(normalizedQuery)) return false;
    if (flat) return true;
    let parentId = category.parentId;
    while (parentId) { if (!expandedIds.has(parentId)) return false; parentId = rowsById.get(parentId)?.category.parentId; }
    return true;
  });

  useEffect(() => {
    if (!editorVisible || sheet) return;
    let frame = 0;
    const measure = () => {
      const top = editorPanelRef.current?.getBoundingClientRect().top;
      if (top !== undefined) setEditorHeight(Math.max(180, Math.floor(window.innerHeight - Math.max(24, top) - 24)));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; measure(); }); };
    measure(); window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, { passive: true });
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule); };
  }, [editorVisible, sheet, notice, error, assetError]);
  useEffect(() => {
    if (!(dirty || orderDirty)) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, orderDirty]);
  useEffect(() => {
    if (modalEditor && editorPanelRef.current) return inertOutside(editorPanelRef.current);
    if (deleteTarget && deleteLayerRef.current) return inertOutside(deleteLayerRef.current);
  }, [modalEditor, deleteTarget]);
  useEffect(() => {
    if (!deleteTarget) return;
    const dialog = deleteLayerRef.current?.querySelector<HTMLElement>('[role="alertdialog"]');
    if (!dialog) return;
    const active = document.activeElement;
    if (!dialog.contains(active) || active === dialog || (active instanceof HTMLButtonElement && active.disabled)) {
      (dialog.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? dialog).focus();
    }
  }, [deleteTarget, deletionImpact, busy]);
  useEffect(() => {
    if (!confirmation) return;
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    dialog.showModal(); confirmCancelRef.current?.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, [confirmation]);
  useEffect(() => {
    if (!menuId) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node) && !menuTriggerRef.current?.contains(event.target as Node)) setMenuId(undefined); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menuId]);
  useEffect(() => {
    if (loading || !deleteReturnFocusIdRef.current) return;
    const id = deleteReturnFocusIdRef.current; deleteReturnFocusIdRef.current = undefined;
    const target = document.querySelector<HTMLElement>(`[data-category-id="${id}"] [data-category-primary-action]`);
    window.requestAnimationFrame(() => (target?.isConnected ? target : newCategoryButtonRef.current)?.focus());
  }, [categories, loading]);

  function restoreEditorOrigin() {
    const origin = editorReturnFocusRef.current;
    const fallback = editorReturnCategoryRef.current ? document.querySelector<HTMLElement>(`[data-category-id="${editorReturnCategoryRef.current}"] [data-category-primary-action]`) : null;
    window.requestAnimationFrame(() => (origin?.isConnected ? origin : fallback?.isConnected ? fallback : newCategoryButtonRef.current)?.focus());
  }
  function resetSeo() {
    seoSequence.current += 1;
    setSeoState(undefined); setSeoDraft(EMPTY_CATEGORY_SEO); setSeoBaseline(JSON.stringify(EMPTY_CATEGORY_SEO));
    setSeoOpen(false); setSeoLoading(false); setSeoError("");
  }
  async function loadSeo() {
    if (!canManageSeo || !editor || seoState || seoLoading) return;
    if (editor.kind === "create") { setSeoState({ draft: EMPTY_CATEGORY_SEO }); return; }
    const sequence = ++seoSequence.current;
    setSeoLoading(true); setSeoError("");
    try {
      const result = await categorySeoClient.load(editor.categoryId);
      if (sequence !== seoSequence.current) return;
      setSeoState(result); setSeoDraft(result.draft); setSeoBaseline(JSON.stringify(result.draft));
    } catch (failure) {
      if (sequence === seoSequence.current) setSeoError(failure instanceof Error ? failure.message : "SEO alanları yüklenemedi.");
    } finally { if (sequence === seoSequence.current) setSeoLoading(false); }
  }
  function clearEditor(restore = true) {
    resetSeo(); setMediaPending(false); draftVersionRef.current = undefined;
    setEditor(undefined); setDraft(undefined); setBaseline(""); setNameError(""); setPositionError(""); setMenuId(undefined);
    if (restore) restoreEditorOrigin();
  }
  function requestConfirmation(value: Confirmation) {
    confirmationOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmationCategoryRef.current = confirmationOriginRef.current?.closest<HTMLElement>("[data-category-id]")?.dataset.categoryId;
    setMenuId(undefined); setConfirmation(value);
    return new Promise<boolean>((resolve) => { confirmationResolverRef.current = resolve; });
  }
  function resolveConfirmation(confirmed: boolean) {
    const resolve = confirmationResolverRef.current; confirmationResolverRef.current = undefined;
    setConfirmation(undefined); resolve?.(confirmed);
    if (!confirmed) window.requestAnimationFrame(() => {
      const origin = confirmationOriginRef.current;
      const row = confirmationCategoryRef.current ? document.querySelector<HTMLElement>(`[data-category-id="${confirmationCategoryRef.current}"] [data-category-primary-action]`) : null;
      (editor && sheet ? editorCloseRef.current : origin?.isConnected ? origin : row?.isConnected ? row : newCategoryButtonRef.current)?.focus();
    });
  }
  function cancelSort(restore = true) { setSortSnapshot(undefined); setSortDraft(undefined); setDragId(undefined); setDropId(undefined); if (restore) window.requestAnimationFrame(() => sortToggleRef.current?.focus()); }
  async function allowUnsaved() {
    if (!(dirty || orderDirty)) return true;
    const accepted = await requestConfirmation({ title: "Değişiklikler kaydedilmedi", description: "Kaydetmeden devam edilsin mi?", label: "Kaydetmeden devam et" });
    if (accepted) { clearEditor(false); cancelSort(false); }
    return accepted;
  }
  function mountEditor(mode: EditorMode, category?: CatalogCategory, focus = true) {
    const siblings = categories.filter((item) => item.status === "active" && item.parentId === (mode.kind === "create" ? mode.parentId : category?.parentId));
    const nextPosition = Math.min(9_999, Math.max(0, ...siblings.map(item => item.position)) + 1);
    const value = draftFor(category, mode.kind === "create" ? mode.parentId : undefined, nextPosition);
    resetSeo(); setMediaPending(false); draftVersionRef.current = category?.version;
    setEditor(mode); setDraft(value); setBaseline(snapshot(value)); setNameError(""); setPositionError(""); setMenuId(undefined);
    if (mode.kind === "create" && mode.parentId) setExpandedIds((current) => new Set([...current, mode.parentId!]));
    if (focus) window.requestAnimationFrame(() => (category?.status === "archived" || !canManage ? editorCloseRef.current : editorNameRef.current)?.focus());
  }
  async function openCreate(parentId?: string) {
    if (!canManage || loading || listUnavailable || interactionBusy || sorting || !hierarchy.valid || !await allowUnsaved()) return;
    if (parentId) {
      const parent = rowsById.get(parentId);
      if (!parent || parent.category.status !== "active" || parent.depth >= 8) return;
    }
    editorReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    editorReturnCategoryRef.current = parentId;
    mountEditor(parentId ? { kind: "create", parentId } : { kind: "create" });
  }
  async function openEdit(categoryId: string) {
    if (interactionBusy || sorting) return;
    if (editor?.kind === "edit" && editor.categoryId === categoryId) { if (sheet) editorCloseRef.current?.focus(); return; }
    if (!await allowUnsaved()) return;
    const category = categories.find((item) => item.id === categoryId); if (!category) return;
    editorReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    editorReturnCategoryRef.current = categoryId; mountEditor({ kind: "edit", categoryId }, category);
  }
  async function requestCloseEditor() { if (!interactionBusy && await allowUnsaved()) clearEditor(); }
  async function refresh() { if (interactionBusy || !await allowUnsaved()) return; cancelSort(false); clearEditor(false); await load(); }
  async function startSort() {
    if (!canManage || interactionBusy || loading || sorting || !hierarchy.valid || !await allowUnsaved()) return;
    clearEditor(false); setSortSnapshot(categories); setSortDraft(categories); setFilter("all"); setQuery(""); setExpandedIds(new Set(childIdsByParent.keys())); setNotice("");
  }
  function move(categoryId: string, targetId: string) { if (!sortDraft || busy) return; setSortDraft(moveCategoryAmongSiblings(sortDraft, categoryId, targetId)); setDropId(undefined); }
  async function saveOrder() {
    if (!canManage || busy || !orderGroups.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.reorderCategories({ groups: orderGroups });
      const changed = new Map(result.categories.map((category) => [category.id, category]));
      setCategories((current) => Object.freeze(current.map((category) => changed.get(category.id) ?? category)));
      cancelSort(); setNotice("Sıralama kaydedildi.");
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (interactionBusy || mediaPending || !editor || !draft || readOnly || !dirty) return;
    if (editor.kind === "edit" && !selectedCategory) { setError("Kategori artık bulunamıyor. Listeyi yenileyin."); return; }
    if (!hierarchy.valid) { setError("Kategori yapısı doğrulanamadı."); return; }
    const name = draft.name.trim(), position = Number(draft.position);
    const invalidName = !name, invalidPosition = !draft.position.trim() || !Number.isSafeInteger(position) || position < 0 || position > 9_999;
    setNameError(invalidName ? "Kategori adı gerekli." : ""); setPositionError(invalidPosition ? "0–9999 arasında bir sıra girin." : "");
    if (invalidName || invalidPosition) { if (invalidName) editorNameRef.current?.focus(); return; }
    if (parentLocked && draft.parentId !== (selectedCategory?.parentId ?? "")) { setError("Aktif alt kategorisi olan kategorinin üst kategorisi değiştirilemez."); return; }
    if (draft.parentId && !parentRows.some(({ category }) => category.id === draft.parentId)) { setError("Geçerli bir üst kategori seçin."); return; }
    setBusy(true); setError(""); setNotice(""); setSeoError("");
    let categorySaved = false;
    try {
      let savedCategory = selectedCategory;
      if (categoryDirty || editor.kind === "create") {
        const fields = { name, position, ...(draft.parentId ? { parentId: draft.parentId } : {}), image: draft.imageAssetId ? { assetId: draft.imageAssetId, altText: draft.imageAltText.trim() } : null };
        const result = editor.kind === "edit" ? await api.updateCategory(editor.categoryId, { expectedVersion: draftVersionRef.current ?? 0, fields }) : await api.createCategory(fields);
        savedCategory = result.category; categorySaved = true;
        setCategories((current) => Object.freeze(current.some((category) => category.id === result.category.id) ? current.map((category) => category.id === result.category.id ? result.category : category) : [...current, result.category]));
        const nextDraft = draftFor(result.category);
        draftVersionRef.current = result.category.version;
        setEditor({ kind: "edit", categoryId: result.category.id }); setDraft(nextDraft); setBaseline(snapshot(nextDraft));
        setHighlightedId(result.category.id);
        if (result.category.parentId) setExpandedIds((current) => new Set([...current, result.category.parentId!]));
      }
      if (seoDirty && seoState && savedCategory) {
        try {
          const result = await categorySeoClient.save(savedCategory.id, savedCategory.name, seoState, seoDraft);
          setSeoState(result); setSeoDraft(result.draft); setSeoBaseline(JSON.stringify(result.draft));
        } catch (failure) {
          const reason = failure instanceof Error ? failure.message : "Yeniden deneyin.";
          setSeoError(`${categorySaved ? "Kategori kaydedildi. " : ""}SEO kaydedilemedi. ${reason}`);
          return;
        }
      }
      setNotice("Kategori kaydedildi.");
      if (categorySaved) await load();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  async function archive(category: CatalogCategory) {
    setMenuId(undefined);
    if (!canArchive || interactionBusy) return;
    if (categories.some((item) => item.parentId === category.id && item.status === "active")) { setError("Önce aktif alt kategorileri taşıyın veya arşivleyin."); return; }
    const retainEditor = !dirty && editor?.kind === "edit" && editor.categoryId === category.id;
    if (!await allowUnsaved() || !await requestConfirmation({ title: "Kategoriyi arşivle", description: `${category.name} mağazadan kaldırılacak.`, label: "Arşivle" })) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api.archiveCategory(category.id, category.version);
      setCategories((current) => Object.freeze(current.map((item) => item.id === category.id ? result.category : item)));
      if (retainEditor) mountEditor({ kind: "edit", categoryId: category.id }, result.category, false);
      setNotice("Kategori arşivlendi."); await load();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  async function openDelete(category: CatalogCategory) {
    if (!canDelete || interactionBusy || !await allowUnsaved()) return;
    setMenuId(undefined); deleteOriginRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    deleteOriginCategoryRef.current = category.id;
    const index = hierarchy.rows.findIndex((row) => row.category.id === category.id);
    deleteFallbackIdRef.current = hierarchy.rows[index + 1]?.category.id ?? hierarchy.rows[index - 1]?.category.id;
    setDeleteTarget(category); setDeletionImpact(undefined); setDeleteError(""); setBusy(true); setError("");
    try {
      const impact = await api.getCategoryDeletionImpact(category.id);
      if (impact.resourceKind !== "category" || impact.resourceId !== category.id) throw new Error("invalid deletion impact");
      setDeletionImpact(impact); deletionIntentRef.current = undefined;
    } catch (failure) { setDeleteTarget(undefined); setError(message(failure)); restoreDeleteOrigin(); }
    finally { setBusy(false); }
  }
  function restoreDeleteOrigin() { window.requestAnimationFrame(() => {
    const origin = deleteOriginRef.current;
    const row = deleteOriginCategoryRef.current ? document.querySelector<HTMLElement>(`[data-category-id="${deleteOriginCategoryRef.current}"] [data-category-primary-action]`) : null;
    (editor && sheet ? editorCloseRef.current : origin?.isConnected ? origin : row?.isConnected ? row : newCategoryButtonRef.current)?.focus();
  }); }
  function cancelDelete() { if (busy) return; setDeleteTarget(undefined); setDeletionImpact(undefined); setDeleteError(""); restoreDeleteOrigin(); }
  function deleteCategory(confirmation: string) {
    if (!canDelete || !deleteTarget || !deletionImpact || busy) return;
    const current = deletionIntentRef.current;
    const operationId = current?.categoryId === deleteTarget.id && current.expectedVersion === deletionImpact.expectedVersion && current.confirmation === confirmation ? current.operationId : crypto.randomUUID();
    deletionIntentRef.current = Object.freeze({ categoryId: deleteTarget.id, expectedVersion: deletionImpact.expectedVersion, confirmation, operationId });
    setBusy(true); setDeleteError("");
    void api.deleteCategory(deleteTarget.id, { operationId, expectedVersion: deletionImpact.expectedVersion, confirmation }).then(async (result) => {
      if (!result.deleted || result.resourceId !== deleteTarget.id || result.auditId !== operationId) throw new Error("invalid deletion result");
      if (editor?.kind === "edit" && editor.categoryId === deleteTarget.id) clearEditor(false);
      deleteReturnFocusIdRef.current = deleteFallbackIdRef.current;
      setDeleteTarget(undefined); setDeletionImpact(undefined); setNotice("Kategori kalıcı olarak silindi."); await load();
      if (!deleteReturnFocusIdRef.current) window.requestAnimationFrame(() => newCategoryButtonRef.current?.focus());
    }).catch((failure) => setDeleteError(message(failure))).finally(() => setBusy(false));
  }
  function toggle(categoryId: string) { setExpandedIds((current) => { const next = new Set(current); if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId); return next; }); }
  function handleEditorKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !interactionBusy) { event.preventDefault(); void requestCloseEditor(); return; }
    if (event.key !== "Tab" || !modalEditor) return;
    const nodes = Array.from(editorPanelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex]:not([tabindex="-1"])') ?? []).filter((node) => node.tabIndex !== -1 && node.getClientRects().length > 0);
    const first = nodes[0], last = nodes.at(-1); if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || !editorPanelRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !editorPanelRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMenuId(undefined); menuTriggerRef.current?.focus(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const index = options.findIndex((item) => item === document.activeElement);
    options[event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
  }
  const editorPath = draft?.parentId ? rowsById.get(draft.parentId)?.label ?? "Ana kategori" : "Ana kategori";

  function renderRow({ category, depth, label }: CatalogCategoryTreeRow<CatalogCategory>) {
    const children = childIdsByParent.get(category.id) ?? [];
    const selected = editor?.kind === "edit" && editor.categoryId === category.id;
    const siblings = displayCategories.filter((item) => item.status === "active" && item.parentId === category.parentId).sort(compare);
    const siblingIndex = siblings.findIndex((item) => item.id === category.id);
    const imageUrl = category.image ? assetsById.get(category.image.assetId)?.publicUrl ?? category.image.publicUrl : undefined;
    const source = dragId ? rowsById.get(dragId)?.category : undefined;
    const dropAfter = source ? siblings.findIndex(item => item.id === source.id) < siblingIndex : false;
    const canDrop = sorting && source?.status === "active" && category.status === "active" && source.parentId === category.parentId && source.id !== category.id;
    return <div key={category.id} role="listitem" data-category-id={category.id} className={styles.categoryRow} data-child={!flat && category.parentId ? "true" : undefined} data-selected={selected || undefined} data-highlighted={highlightedId === category.id || undefined} data-status={category.status} data-sorting={sorting || undefined} data-dragging={dragId === category.id || undefined} data-drop-target={dropId === category.id || undefined} data-drop-after={dropAfter || undefined} style={{ "--category-depth": flat ? 0 : depth - 1 } as CSSProperties}
      onDragOver={(event) => { if (canDrop) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropId(category.id); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropId(undefined); }}
      onDrop={(event) => { event.preventDefault(); if (canDrop && dragId) move(dragId, category.id); setDragId(undefined); setDropId(undefined); }}>
      <div className={styles.categoryMain}>
        {sorting && category.status === "active" ? <button type="button" className={styles.dragHandle} draggable={!busy} disabled={busy} aria-label={`${category.name} kategorisini sürükle`} onDragStart={(event) => { event.dataTransfer.setData("text/plain", category.id); event.dataTransfer.effectAllowed = "move"; setDragId(category.id); }} onDragEnd={() => { setDragId(undefined); setDropId(undefined); }}><GripVertical aria-hidden="true" /></button> : children.length > 0 && !flat ? <button type="button" className={styles.rowChevron} aria-expanded={expandedIds.has(category.id)} aria-label={`${category.name} alt kategorilerini ${expandedIds.has(category.id) ? "kapat" : "aç"}`} onClick={() => toggle(category.id)}>{expandedIds.has(category.id) ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</button> : <span className={styles.rowChevronPlaceholder} />}
        <button type="button" data-category-primary-action className={styles.categoryNameButton} onClick={() => void openEdit(category.id)} disabled={interactionBusy || sorting} aria-current={selected ? "true" : undefined}>
          <span className={`${styles.thumbnail} ${imageUrl ? "" : styles.thumbnailMissing}`}>{imageUrl ? <img src={imageUrl} alt={category.image?.altText || category.name} loading="lazy" /> : category.image ? <ImageOff aria-label="Kategori görseli yüklenemedi" /> : <ImagePlus aria-label="Görsel yok" />}</span>
          <span className={styles.categoryCopy}><strong>{category.name}</strong><small>{flat && category.parentId ? label : children.length ? `${children.length} alt kategori` : !category.image ? "Görsel eklenmedi" : `Seviye ${depth}`}</small><span className={styles.mobileOrder}>Sıra {category.position}</span></span>
        </button>
      </div>
      <span className={styles.status} data-status={category.status}>{category.status === "active" ? <CircleCheck aria-hidden="true" /> : <Archive aria-hidden="true" />}{category.status === "active" ? "Aktif" : "Arşiv"}</span>
      <span className={styles.rowOrder}>{category.position}</span>
      <div className={styles.rowActions}>
        {sorting ? category.status === "active" ? <><button type="button" className={styles.iconButton} aria-label={`${category.name} kategorisini yukarı taşı`} disabled={busy || siblingIndex === 0} onClick={() => move(category.id, siblings[siblingIndex - 1]!.id)}><ArrowUp aria-hidden="true" /></button><button type="button" className={styles.iconButton} aria-label={`${category.name} kategorisini aşağı taşı`} disabled={busy || siblingIndex === siblings.length - 1} onClick={() => move(category.id, siblings[siblingIndex + 1]!.id)}><ArrowDown aria-hidden="true" /></button></> : null : <>
          {category.status === "active" && canManage ? <button type="button" className={styles.rowQuickAction} aria-label={`${category.name} altında alt kategori ekle`} title="Alt kategori ekle" disabled={interactionBusy || depth >= 8} onClick={() => void openCreate(category.id)}><Plus aria-hidden="true" /></button> : <span className={styles.rowQuickActionPlaceholder} />}
          <div className={styles.moreMenuWrap}><button type="button" className={styles.rowMoreAction} aria-label={`${category.name} kategori işlemleri`} aria-haspopup="menu" aria-expanded={menuId === category.id} disabled={interactionBusy} onClick={(event) => { menuTriggerRef.current = event.currentTarget; setMenuId((current) => current === category.id ? undefined : category.id); }}><MoreHorizontal aria-hidden="true" /></button>
            {menuId === category.id ? <div ref={menuRef} className={styles.moreMenu} role="menu" aria-label={`${category.name} işlemleri`} onKeyDown={handleMenuKeyDown}>
              <button type="button" role="menuitem" onClick={() => void openEdit(category.id)}>{category.status === "active" && canManage ? "Düzenle" : "Görüntüle"}</button>
              {category.status === "active" && depth < 8 && canManage ? <button type="button" role="menuitem" onClick={() => void openCreate(category.id)}>Alt kategori ekle</button> : null}
              {category.status === "active" && canArchive ? <button type="button" role="menuitem" onClick={() => void archive(category)}><Archive aria-hidden="true" /> Arşivle</button> : null}
              {canDelete ? <button type="button" role="menuitem" className={styles.destructiveMenuItem} onClick={() => void openDelete(category)}><Trash2 aria-hidden="true" /> Kalıcı sil</button> : null}
            </div> : null}
          </div>
        </>}
      </div>
    </div>;
  }

  return <section className={styles.categoryManager} aria-labelledby="category-manager-title">
    <PanelTopbarBridge title="Kategoriler" hideHeading />
    <h1 id="category-manager-title" className="sr-only">Kategoriler</h1>
    <div className={styles.toolbar}>
      <div className={styles.searchField}><Search aria-hidden="true" /><input type="search" value={query} placeholder="Kategori ara" aria-label="Kategori ara" disabled={sorting} onChange={(event) => setQuery(event.currentTarget.value)} />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Kategori aramasını temizle"><X aria-hidden="true" /></button> : null}</div>
      <div className={styles.toolbarButtons}><button type="button" className={styles.refreshButton} onClick={() => void refresh()} disabled={loading || interactionBusy} aria-label="Kategorileri yenile" title="Yenile"><RefreshCw aria-hidden="true" /></button><button ref={sortToggleRef} type="button" className={styles.sortToggle} aria-pressed={sorting} onClick={() => void startSort()} disabled={!canManage || loading || interactionBusy || sorting || !hierarchy.valid}><GripVertical aria-hidden="true" /><span>Sırala</span></button><button ref={newCategoryButtonRef} type="button" className={editorVisible || sorting ? styles.cancelButton : styles.primaryButton} onClick={() => void openCreate()} disabled={!canManage || loading || listUnavailable || interactionBusy || sorting}><Plus aria-hidden="true" /> Yeni kategori</button></div>
    </div>
    <div className={styles.viewbar}><div className={styles.filters} role="group" aria-label="Kategori filtreleri"><button type="button" aria-pressed={filter === "all"} disabled={sorting} onClick={() => setFilter("all")}>Tümü <span>{categories.length}</span></button><button type="button" aria-pressed={filter === "missing"} disabled={sorting} onClick={() => setFilter("missing")}><ImageOff aria-hidden="true" /> Görselsiz <span>{categories.filter((category) => category.status === "active" && !category.image).length}</span></button><button type="button" aria-pressed={filter === "archived"} disabled={sorting} onClick={() => setFilter("archived")}>Arşiv <span>{categories.filter((category) => category.status === "archived").length}</span></button></div><div className={styles.treeTools}><button type="button" onClick={() => setExpandedIds(new Set(childIdsByParent.keys()))} disabled={loading || flat}>Tümünü aç</button><button type="button" onClick={() => setExpandedIds(new Set())} disabled={loading || flat || sorting}>Kapat</button></div></div>
    {sorting ? <div className={styles.sortBar}><div><GripVertical aria-hidden="true" /><span>Aynı üst kategori içindeki sıralama.</span></div><div><button type="button" className={styles.cancelButton} onClick={() => cancelSort()} disabled={busy}>Vazgeç</button><button type="button" className={styles.primaryButton} onClick={() => void saveOrder()} disabled={busy || !orderDirty}>{busy ? "Kaydediliyor…" : "Sıralamayı kaydet"}</button></div></div> : null}
    {error || assetError || !hierarchy.valid ? <div className={styles.error} role="alert">{error || assetError || "Kategori yapısı doğrulanamadı."}<button type="button" className={styles.textButton} onClick={() => void refresh()} disabled={interactionBusy}>Yeniden dene</button></div> : null}
    {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
    {hierarchy.valid ? <div className={`${styles.workspace} ${editorVisible ? styles.workspaceEditorOpen : ""}`} data-editor-open={editorVisible ? "true" : "false"}>
      <section className={styles.treePanel} aria-label="Kategori listesi">
        <div className={styles.listHead} aria-hidden="true"><span>Kategori</span><span>Durum</span><span>Sıra</span><span /></div>
        <div className={styles.categoryTree} aria-busy={loading} role="list">
          {loading && categories.length === 0 ? <div role="status"><span className="sr-only">Kategoriler yükleniyor</span>{Array.from({ length: 5 }, (_, i) => <div key={i} className={styles.skeletonRow} aria-hidden="true"><span /><span /></div>)}</div> : listUnavailable && categories.length === 0 ? <div className={styles.noResults}><FolderTree aria-hidden="true" /><strong>Kategoriler yüklenemedi</strong></div> : categories.length === 0 ? <div className={styles.emptyState}><FolderTree aria-hidden="true" /><strong>Henüz kategori yok</strong>{canManage ? <button type="button" className={styles.cancelButton} onClick={() => void openCreate()}><Plus aria-hidden="true" /> Kategori oluştur</button> : null}</div> : visibleRows.length === 0 ? <div className={styles.noResults}><Search aria-hidden="true" /><strong>Sonuç bulunamadı</strong><button type="button" className={styles.textButton} onClick={() => { setQuery(""); setFilter("all"); }}>Filtreleri temizle</button></div> : visibleRows.map(renderRow)}
        </div>
        <footer className={styles.listSummary}><span>{flat ? `${visibleRows.length} / ${categories.length} kategori` : `${categories.length} kategori · ${categories.filter((category) => !category.parentId).length} ana kategori`}</span></footer>
      </section>
      {editor && draft ? <aside hidden={!editorVisible} ref={editorPanelRef} className={styles.detailPanel} style={editorHeight ? { "--category-editor-height": `${editorHeight}px` } as CSSProperties : undefined} role={modalEditor ? "dialog" : undefined} aria-modal={modalEditor ? "true" : undefined} aria-labelledby="category-editor-title" tabIndex={-1}>
        <form className={styles.editorForm} onSubmit={save} onKeyDown={handleEditorKeyDown} noValidate>
          <header className={styles.editorHeader}><div><p className={styles.editorPath}>{editorPath}</p><h2 id="category-editor-title">{editor.kind === "edit" ? selectedCategory?.name ?? "Kategori" : editor.parentId ? "Yeni alt kategori" : "Yeni kategori"}</h2></div><button ref={editorCloseRef} type="button" className={styles.closeEditor} onClick={() => void requestCloseEditor()} disabled={interactionBusy} aria-label="Kategori editörünü kapat"><X aria-hidden="true" /></button></header>
          <div className={styles.editorBody}>
            <CategoryMediaField key={editor.kind === "edit" ? `edit:${editor.categoryId}` : `create:${editor.parentId ?? "root"}`} onPendingChange={setMediaPending} assetId={draft.imageAssetId} imageUrl={selectedCategory?.image && draft.imageAssetId === selectedCategory.image.assetId ? selectedCategory.image.publicUrl : undefined} altText={draft.imageAltText} assets={assets} disabled={interactionBusy || readOnly} onChange={(value) => setDraft((current) => current ? { ...current, imageAssetId: value.assetId, imageAltText: value.altText } : current)} onAssetUploaded={(asset) => setAssets((current) => Object.freeze([...current.filter((item) => item.id !== asset.id), asset]))} onBusyChange={setUploadBusy} />
            <div className={styles.formFields}>
              <label><span>Kategori adı <b>*</b></span><input ref={editorNameRef} name="name" maxLength={120} autoComplete="off" value={draft.name} disabled={interactionBusy || readOnly} aria-invalid={nameError ? "true" : undefined} aria-describedby={nameError ? "category-name-error" : undefined} onChange={(event) => { setDraft({ ...draft, name: event.currentTarget.value }); setNameError(""); }} />{nameError ? <small className={styles.fieldError} id="category-name-error">{nameError}</small> : null}</label>
              <div className={styles.fieldGroup}><span>Üst kategori</span><CategoryParentPicker disabled={interactionBusy || readOnly || parentLocked} value={draft.parentId} rows={parentRows} onChange={(parentId) => setDraft({ ...draft, parentId })} />{parentLocked ? <small className={styles.fieldHelp}>Aktif alt kategorisi olduğu için üst kategori sabit.</small> : null}</div>
              <div className={styles.metadataRow}><label><span>Görünüm sırası</span><input name="position" type="number" min="0" max="9999" inputMode="numeric" value={draft.position} disabled={interactionBusy || readOnly} aria-invalid={positionError ? "true" : undefined} aria-describedby={positionError ? "category-position-error" : undefined} onChange={(event) => { setDraft({ ...draft, position: event.currentTarget.value }); setPositionError(""); }} />{positionError ? <small className={styles.fieldError} id="category-position-error">{positionError}</small> : null}</label><div className={styles.readonlyMeta}><span>Durum</span><strong className={styles.status} data-status={archived ? "archived" : "active"}>{archived ? <Archive aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}{archived ? "Arşiv" : "Aktif"}</strong></div></div>
            </div>
            {canManageSeo ? <details className={styles.seoSection} open={seoOpen} onToggle={(event) => { const open = event.currentTarget.open; setSeoOpen(open); if (open) void loadSeo(); }}>
              <summary>SEO <ChevronDown aria-hidden="true" /></summary>
              <div>
                {seoLoading ? <p className={styles.fieldHelp} role="status">Yükleniyor…</p> : null}
                {seoError ? <div className={styles.mediaError} role="alert"><p>{seoError}</p>{!seoState ? <button type="button" className={styles.textButton} onClick={() => void loadSeo()} disabled={seoLoading}>Tekrar dene</button> : null}<a className={styles.textButton} href="/seo/categories">Kategori SEO ayarları</a></div> : null}
                {seoState ? <>
                  <label className={styles.field}><span>SEO başlığı</span><input value={seoDraft.metaTitle} maxLength={160} placeholder={draft.name || "Kategori adı"} disabled={interactionBusy || readOnly} onChange={(event) => setSeoDraft({ ...seoDraft, metaTitle: event.currentTarget.value })} /></label>
                  <label className={styles.field}><span>SEO açıklaması</span><textarea value={seoDraft.metaDescription} maxLength={4000} rows={3} disabled={interactionBusy || readOnly} onChange={(event) => setSeoDraft({ ...seoDraft, metaDescription: event.currentTarget.value })} /></label>
                </> : null}
                {selectedCategory ? <span className={styles.slugPreview}>/{selectedCategory.slug}</span> : null}
              </div>
            </details> : null}
            {readOnly ? <p className={styles.readonlyNote}>{archived ? <Archive aria-hidden="true" /> : null}{archived ? "Arşivlenmiş kategori." : "Salt okunur."}</p> : null}
          </div>
          <footer className={styles.editorFooter}><span className={styles.dirtyState}>{dirty ? "Kaydedilmedi" : ""}</span><div><button type="button" className={styles.cancelButton} onClick={() => void requestCloseEditor()} disabled={interactionBusy}>{readOnly ? "Kapat" : "Vazgeç"}</button>{!readOnly ? <button type="submit" className={styles.primaryButton} disabled={interactionBusy || mediaPending || !dirty || (editor.kind === "edit" && !selectedCategory)}>{uploadBusy ? "Görsel yükleniyor…" : busy ? "Kaydediliyor…" : "Kaydet"}</button> : null}</div></footer>
        </form>
      </aside> : null}
    </div> : null}
    {modalEditor ? <div className={styles.editorScrim} data-category-scrim aria-hidden="true" onClick={() => { if (!interactionBusy) void requestCloseEditor(); }} /> : null}
    {confirmation ? <dialog ref={confirmDialogRef} className={styles.confirmDialog} aria-labelledby="category-confirm-title" aria-describedby="category-confirm-description" onCancel={(event) => { event.preventDefault(); resolveConfirmation(false); }}><form onSubmit={(event) => { event.preventDefault(); resolveConfirmation(true); }}><header className={styles.confirmHeader}><h2 id="category-confirm-title">{confirmation.title}</h2><button type="button" className={styles.iconButton} aria-label="İşlemi iptal et" onClick={() => resolveConfirmation(false)}><X aria-hidden="true" /></button></header><p id="category-confirm-description">{confirmation.description}</p><footer className={styles.confirmActions}><button ref={confirmCancelRef} type="button" className={styles.cancelButton} onClick={() => resolveConfirmation(false)}>Vazgeç</button><button type="submit" className={styles.primaryButton}>{confirmation.label}</button></footer></form></dialog> : null}
    {deleteTarget && canDelete ? <div ref={deleteLayerRef}>{deleteError ? <p className={styles.deleteFeedback} role="alert">{deleteError}</p> : null}<PermanentDeleteDialog impact={deletionImpact} resourceLabel="Kategori" busy={busy} onCancel={cancelDelete} onConfirm={deleteCategory} /></div> : null}
  </section>;
}
