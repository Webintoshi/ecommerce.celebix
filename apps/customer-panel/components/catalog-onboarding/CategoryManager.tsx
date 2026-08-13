"use client";

import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type { CatalogCategory } from "@celebix/saas-contracts";

import { CatalogOnboardingApiError, catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import {
  buildCatalogCategoryHierarchy,
  type CatalogCategoryTreeRow,
} from "@/lib/catalog-onboarding-ui/category-tree";
import styles from "./category-management.module.css";

type EditorMode = Readonly<
  | { kind: "create"; parentId?: string }
  | { kind: "edit"; categoryId: string }
>;

const ROOT_PARENT = "__root__";

function formValue(data: FormData, key: string) {
  const selected = data.get(key);
  return typeof selected === "string" ? selected.trim() : "";
}

function message(error: unknown) {
  return error instanceof CatalogOnboardingApiError
    ? error.message
    : "Kategori işlemi tamamlanamadı.";
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function CategoryParentPicker({
  disabled,
  initialValue,
  rows,
}: Readonly<{
  disabled: boolean;
  initialValue?: string;
  rows: readonly CatalogCategoryTreeRow<CatalogCategory>[];
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialValue ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalizeSearch(query);
  const visibleRows = normalizedQuery
    ? rows.filter(({ label }) => normalizeSearch(label).includes(normalizedQuery))
    : rows;
  const selected = rows.find(({ category }) => category.id === selectedId);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  function select(value: string) {
    setSelectedId(value);
    setOpen(false);
    setQuery("");
  }

  return <div className={styles.parentPicker} ref={rootRef}>
    <input type="hidden" name="parentId" value={selectedId} />
    <button
      type="button"
      className={styles.parentPickerTrigger}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label="Üst kategori seç"
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
    >
      <span>
        <strong>{selected ? selected.category.name : "Ana kategori"}</strong>
        {selected ? <small>{selected.label}</small> : <small>En üst seviyede gösterilir</small>}
      </span>
      <ChevronDown aria-hidden="true" />
    </button>
    {open ? <div className={styles.parentPickerPopover}>
      <div className={styles.parentPickerSearch}>
        <Search aria-hidden="true" />
        <input
          autoFocus
          type="search"
          value={query}
          placeholder="Üst kategori ara"
          aria-label="Üst kategori ara"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div className={styles.parentPickerOptions} role="listbox" aria-label="Üst kategori seçenekleri">
        {!normalizedQuery || "ana kategori".includes(normalizedQuery) ? <button
          type="button"
          role="option"
          aria-selected={!selectedId}
          className={styles.parentPickerOption}
          onClick={() => select("")}
        >
          <span><strong>Ana kategori</strong><small>En üst seviye</small></span>
          {!selectedId ? <Check aria-hidden="true" /> : null}
        </button> : null}
        {visibleRows.map(({ category, depth, label }) => <button
          type="button"
          role="option"
          aria-selected={selectedId === category.id}
          className={styles.parentPickerOption}
          style={{ "--picker-depth": depth } as CSSProperties}
          key={category.id}
          onClick={() => select(category.id)}
        >
          <span><strong>{category.name}</strong><small>{label}</small></span>
          {selectedId === category.id ? <Check aria-hidden="true" /> : null}
        </button>)}
        {visibleRows.length === 0 && normalizedQuery ? <p className={styles.parentPickerEmpty}>Eşleşen kategori bulunamadı.</p> : null}
      </div>
    </div> : null}
  </div>;
}

export function CategoryManager() {
  const [categories, setCategories] = useState<readonly CatalogCategory[]>([]);
  const [editor, setEditor] = useState<EditorMode>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [positionError, setPositionError] = useState("");
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [menuId, setMenuId] = useState<string>();
  const [highlightedId, setHighlightedId] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCategories(await catalogOnboardingClient.listCategories());
    } catch (failure) {
      setError(message(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hierarchy = buildCatalogCategoryHierarchy(categories);
  const rowsById = useMemo(
    () => new Map(hierarchy.rows.map((row) => [row.category.id, row])),
    [hierarchy.rows],
  );
  const childIdsByParent = useMemo(() => {
    const children = new Map<string, string[]>();
    for (const { category } of hierarchy.rows) {
      if (!category.parentId) continue;
      const branch = children.get(category.parentId) ?? [];
      branch.push(category.id);
      children.set(category.parentId, branch);
    }
    return children;
  }, [hierarchy.rows]);
  const selectedCategory = editor?.kind === "edit"
    ? rowsById.get(editor.categoryId)?.category
    : undefined;
  const unavailableParents = new Set(selectedCategory
    ? [selectedCategory.id, ...hierarchy.descendantIds(selectedCategory.id)]
    : []);
  const parentRows = hierarchy.rows.filter(({ category, depth }) => (
    category.status === "active"
    && !unavailableParents.has(category.id)
    && depth < 8
  ));
  const normalizedQuery = normalizeSearch(query);
  const matchingIds = useMemo(() => new Set(
    normalizedQuery
      ? hierarchy.rows
        .filter(({ category, label }) => (
          normalizeSearch(category.name).includes(normalizedQuery)
          || normalizeSearch(label).includes(normalizedQuery)
        ))
        .map(({ category }) => category.id)
      : [],
  ), [hierarchy.rows, normalizedQuery]);
  const visibleRows = normalizedQuery
    ? hierarchy.rows.filter(({ category }) => matchingIds.has(category.id))
    : hierarchy.rows.filter(({ category }) => {
      let parentId = category.parentId;
      while (parentId) {
        if (!expandedIds.has(parentId)) return false;
        parentId = rowsById.get(parentId)?.category.parentId;
      }
      return true;
    });

  function clearEditor() {
    setEditor(undefined);
    setNameError("");
    setPositionError("");
    setMenuId(undefined);
  }

  function openCreate(parentId?: string) {
    setEditor(parentId ? { kind: "create", parentId } : { kind: "create" });
    setNameError("");
    setPositionError("");
    setMenuId(undefined);
    if (parentId) setExpandedIds((current) => new Set([...current, parentId]));
  }

  function openEdit(categoryId: string) {
    setEditor({ kind: "edit", categoryId });
    setNameError("");
    setPositionError("");
    setMenuId(undefined);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !editor) return;
    if (editor.kind === "edit" && !selectedCategory) {
      setError("Düzenlenecek kategori artık bulunamıyor. Listeyi yenileyip tekrar deneyin.");
      return;
    }
    if (!hierarchy.valid) {
      setError("Kategori hizmetinden gelen hiyerarşi doğrulanamadı.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const name = formValue(data, "name");
    const parentId = formValue(data, "parentId");
    const rawPosition = formValue(data, "position");
    const position = Number(rawPosition);
    const invalidName = !name;
    const invalidPosition = !rawPosition || !Number.isSafeInteger(position) || position < 0 || position > 9_999;
    setNameError(invalidName ? "Kategori adı gerekli." : "");
    setPositionError(invalidPosition ? "0 ile 9999 arasında bir görünüm sırası girin." : "");
    if (invalidName || invalidPosition) return;

    setBusy(true);
    setError("");
    try {
      const fields = { name, position, ...(parentId ? { parentId } : {}) };
      const result = editor.kind === "edit"
        ? await catalogOnboardingClient.updateCategory(editor.categoryId, {
          expectedVersion: selectedCategory?.version ?? 0,
          fields,
        })
        : await catalogOnboardingClient.createCategory(fields);
      setHighlightedId(result.category.id);
      setEditor({ kind: "edit", categoryId: result.category.id });
      if (result.category.parentId) {
        setExpandedIds((current) => new Set([...current, result.category.parentId!]));
      }
      await load();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  async function archive(category: CatalogCategory) {
    setMenuId(undefined);
    if (busy || !window.confirm(`${category.name} kategorisi arşivlensin mi?`)) return;
    setBusy(true);
    setError("");
    try {
      await catalogOnboardingClient.archiveCategory(category.id, category.version);
      if (editor?.kind === "edit" && editor.categoryId === category.id) clearEditor();
      await load();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  function toggle(categoryId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function expandAll() {
    setExpandedIds(new Set(childIdsByParent.keys()));
  }

  const editorParentId = editor?.kind === "edit"
    ? selectedCategory?.parentId
    : editor?.parentId;
  const editorPath = editor?.kind === "edit"
    ? rowsById.get(editor.categoryId)?.label
    : editor?.parentId
      ? `${rowsById.get(editor.parentId)?.label ?? "Kategori"} / Yeni alt kategori`
      : "Ana kategori / Yeni kategori";

  function renderRow({ category, depth, label }: CatalogCategoryTreeRow<CatalogCategory>) {
    const children = childIdsByParent.get(category.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedIds.has(category.id);
    const selected = editor?.kind === "edit" && editor.categoryId === category.id;
    return <div
      key={category.id}
      className={styles.categoryRow}
      data-selected={selected || undefined}
      data-highlighted={highlightedId === category.id || undefined}
      data-status={category.status}
      style={{ "--category-depth": normalizedQuery ? 1 : depth } as CSSProperties}
    >
      <span className={styles.hierarchyLine} aria-hidden="true" />
      {hasChildren && !normalizedQuery ? <button
        type="button"
        className={styles.rowChevron}
        aria-expanded={expanded}
        aria-label={`${category.name} alt kategorilerini ${expanded ? "kapat" : "aç"}`}
        onClick={() => toggle(category.id)}
      >{expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</button> : <span className={styles.rowChevronPlaceholder} />}
      <button
        type="button"
        className={styles.rowMain}
        onClick={() => openEdit(category.id)}
        disabled={busy || category.status !== "active"}
      >
        <strong>{category.name}</strong>
        <small>{normalizedQuery ? label : `Seviye ${depth} · Görünüm sırası ${category.position}`}</small>
      </button>
      <span className={category.status === "active" ? styles.activeBadge : styles.archiveBadge}>
        {category.status === "active" ? "Aktif" : "Arşiv"}
      </span>
      {category.status === "active" ? <button
        type="button"
        className={styles.rowQuickAction}
        onClick={() => openCreate(category.id)}
        disabled={busy || depth >= 8}
        aria-label={`${category.name} altında alt kategori ekle`}
        title="Alt kategori ekle"
      ><Plus aria-hidden="true" /></button> : <span />}
      {category.status === "active" ? <div className={styles.moreMenuWrap}>
        <button
          type="button"
          className={styles.rowMoreAction}
          aria-label={`${category.name} kategori işlemleri`}
          aria-haspopup="menu"
          aria-expanded={menuId === category.id}
          onClick={() => setMenuId((current) => current === category.id ? undefined : category.id)}
        ><MoreHorizontal aria-hidden="true" /></button>
        {menuId === category.id ? <div className={styles.moreMenu} role="menu">
          <button type="button" role="menuitem" onClick={() => openEdit(category.id)}>Düzenle</button>
          {depth < 8 ? <button type="button" role="menuitem" onClick={() => openCreate(category.id)}>Alt kategori ekle</button> : null}
          <button type="button" role="menuitem" className={styles.destructiveMenuItem} onClick={() => void archive(category)}>Arşivle</button>
        </div> : null}
      </div> : <span />}
    </div>;
  }

  return <section className={styles.categoryManager} aria-labelledby="category-manager-title">
    <header className={styles.pageHeader}>
      <div>
        <h1 id="category-manager-title">Kategoriler</h1>
        <p>Mağazanızın kategori yapısını oluşturun ve düzenleyin.</p>
      </div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.refreshButton} onClick={() => void load()} disabled={loading || busy} aria-label="Kategorileri yenile" title="Yenile">
          <RefreshCw aria-hidden="true" />
        </button>
        <button type="button" className={styles.primaryButton} onClick={() => openCreate()} disabled={busy}>
          <Plus aria-hidden="true" /> Yeni kategori
        </button>
      </div>
    </header>

    {error || !hierarchy.valid ? <div className={styles.error} role="alert">{error || "Kategori hizmetinden gelen hiyerarşi doğrulanamadı."}</div> : null}

    {hierarchy.valid ? <div className={styles.workspace} data-editor-open={editor ? "true" : "false"}>
      <section className={styles.treePanel} aria-label="Kategori ağacı">
        <div className={styles.treeToolbar}>
          <div className={styles.searchField}>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Kategori ara"
              aria-label="Kategori ara"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label="Kategori aramasını temizle"><X aria-hidden="true" /></button> : null}
          </div>
          <div className={styles.treeToolbarActions}>
            <button type="button" onClick={expandAll} disabled={loading || normalizedQuery.length > 0}>Tümünü aç</button>
            <button type="button" onClick={() => setExpandedIds(new Set())} disabled={loading || normalizedQuery.length > 0}>Tümünü kapat</button>
          </div>
        </div>
        <div className={styles.treeSummary}>
          <span>{categories.length} kategori</span>
          {normalizedQuery ? <span>{visibleRows.length} sonuç</span> : null}
        </div>
        <div className={styles.categoryTree} aria-busy={loading}>
          {loading ? <div className={styles.loadingState} role="status"><RefreshCw aria-hidden="true" /> Kategoriler yükleniyor…</div> : categories.length === 0 ? <div className={styles.emptyState}>
            <FolderTree aria-hidden="true" />
            <strong>Henüz kategori oluşturulmadı</strong>
            <p>İlk kategorinizi oluşturarak ürün yapınızı düzenlemeye başlayın.</p>
            <button type="button" className={styles.primaryButton} onClick={() => openCreate()}><Plus aria-hidden="true" /> Kategori oluştur</button>
          </div> : visibleRows.length === 0 ? <div className={styles.noResults}>
            <strong>Eşleşen kategori bulunamadı</strong>
            <p>Farklı bir kategori adıyla tekrar arayın.</p>
          </div> : visibleRows.map(renderRow)}
        </div>
      </section>

      <aside className={styles.detailPanel} aria-label="Kategori detay editörü">
        {editor ? <form
          className={styles.editorForm}
          key={editor.kind === "edit" ? `edit:${editor.categoryId}:${selectedCategory?.version ?? 0}` : `create:${editor.parentId ?? ROOT_PARENT}`}
          onSubmit={save}
          noValidate
        >
          <header className={styles.editorHeader}>
            <div>
              <span>{editor.kind === "edit" ? "KATEGORİ DETAYI" : editor.parentId ? "YENİ ALT KATEGORİ" : "YENİ KATEGORİ"}</span>
              <h2>{editor.kind === "edit" ? selectedCategory?.name ?? "Kategori" : "Kategori oluştur"}</h2>
              <p>{editorPath}</p>
            </div>
            <button type="button" className={styles.closeEditor} onClick={clearEditor} aria-label="Kategori editörünü kapat"><X aria-hidden="true" /></button>
          </header>

          <div className={styles.editorBody}>
            <section className={styles.formSection}>
              <header><strong>Temel bilgiler</strong><small>Kategorinin adı ve mağazadaki konumu</small></header>
              <div className={styles.formFields}>
                <label>
                  <span>Kategori adı <b>*</b></span>
                  <input
                    name="name"
                    maxLength={120}
                    defaultValue={selectedCategory?.name ?? ""}
                    aria-invalid={nameError ? "true" : undefined}
                    aria-describedby={nameError ? "category-name-error" : undefined}
                    onChange={() => nameError && setNameError("")}
                  />
                  {nameError ? <small className={styles.fieldError} id="category-name-error">{nameError}</small> : null}
                </label>
                <div className={styles.fieldGroup}>
                  <span>Üst kategori</span>
                  <CategoryParentPicker
                    disabled={busy}
                    initialValue={editorParentId}
                    rows={parentRows}
                  />
                </div>
                <label>
                  <span>Görünüm sırası <b>*</b></span>
                  <input
                    name="position"
                    inputMode="numeric"
                    defaultValue={selectedCategory?.position ?? 0}
                    aria-invalid={positionError ? "true" : undefined}
                    aria-describedby="category-position-help"
                    onChange={() => positionError && setPositionError("")}
                  />
                  <small id="category-position-help" className={positionError ? styles.fieldError : styles.fieldHelp}>{positionError || "Düşük değerler önce gösterilir."}</small>
                </label>
                {selectedCategory ? <div className={styles.readonlyMeta}>
                  <span>Durum</span>
                  <strong><i className={selectedCategory.status === "active" ? styles.statusDotActive : styles.statusDotArchived} />{selectedCategory.status === "active" ? "Aktif" : "Arşiv"}</strong>
                  <small>Durum mevcut arşivleme akışıyla yönetilir.</small>
                </div> : null}
              </div>
            </section>
          </div>

          <footer className={styles.editorFooter}>
            {selectedCategory?.status === "active" ? <button type="button" className={styles.archiveButton} onClick={() => void archive(selectedCategory)} disabled={busy}><Archive aria-hidden="true" /> Arşivle</button> : <span />}
            <div>
              <button type="button" className={styles.cancelButton} onClick={clearEditor} disabled={busy}>Vazgeç</button>
              <button type="submit" className={styles.primaryButton} disabled={busy || (editor.kind === "edit" && !selectedCategory)}>
                {busy ? "Kaydediliyor…" : editor.kind === "edit" ? "Değişiklikleri kaydet" : "Kategori oluştur"}
              </button>
            </div>
          </footer>
        </form> : <div className={styles.detailPlaceholder}>
          <span><FolderTree aria-hidden="true" /></span>
          <strong>Kategori detayları</strong>
          <p>Düzenlemek için ağaçtan bir kategori seçin veya yeni bir kategori oluşturun.</p>
          <button type="button" className={styles.primaryButton} onClick={() => openCreate()}><Plus aria-hidden="true" /> Yeni kategori</button>
        </div>}
      </aside>
    </div> : null}
  </section>;
}
