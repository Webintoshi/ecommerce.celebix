"use client";

import Link from "next/link";
import {
  Archive,
  ArrowDownUp,
  CircleCheck,
  Clock3,
  Download,
  Eye,
  FileUp,
  Filter as FilterIcon,
  GripVertical,
  ImageOff,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  CatalogOnboardingOptions,
  CatalogProductListQuery,
  CatalogProductSort,
  CatalogProductStockFilter,
  CatalogProductListVariantSummary,
  CatalogProductPageSize,
  Product,
  PermanentDeletionImpact,
} from "@celebix/saas-contracts";
import { catalogProductListQueryDigest } from "@celebix/saas-contracts";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { PermanentDeleteDialog } from "@/components/shared/PermanentDeleteDialog";
import { ProductCategoryRankConsole } from "@/components/catalog/ProductCategoryRankConsole";
import { catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import {
  CatalogApiError,
  catalogApi,
  type CatalogDashboardSummary,
  type ProductFeaturedImage,
} from "@/lib/catalog-ui/client";
import { parseProductListUrlState, productListUrlStateQuery } from "@/lib/catalog-ui/product-list-query";
import { productStockPresentation } from "@/lib/catalog-ui/stock-presentation";
import catalogStyles from "./catalog-operations.module.css";
import listStyles from "./product-list.module.css";

type Filter = "all" | "draft" | "active" | "archived";
type StockFilter = "all" | CatalogProductStockFilter;
type Sort = CatalogProductSort;
type BulkAction = "" | "active" | "draft" | "archive";
type ProductRow = Readonly<{
  product: Product;
  variant?: CatalogProductListVariantSummary;
  featuredImage?: ProductFeaturedImage;
}>;
type BulkCatalogApi = Pick<typeof catalogApi, "bulkMutateProducts">;
type LoadOptions = Readonly<{ cursor?: string; mutationToken?: number }>;
type LoadResult = "applied" | "blocked" | "failed" | "stale";
type SummaryState = "loading" | "ready" | "unavailable";
type BulkOutcome = Readonly<{
  completed: number;
  failed: number;
  reconciliation: "succeeded" | "failed";
}>;

const STATUS_LABELS = Object.freeze({ draft: "Kapalı", active: "Aktif", archived: "Arşivlenmiş" });

function safeMessage(error: unknown) {
  return error instanceof CatalogApiError ? error.message : "Ürünler yüklenemedi. Lütfen yeniden deneyin.";
}

function money(cents: number | null | undefined, currency: string) {
  if (cents === null) return "Fiyat güncelleniyor";
  if (cents === undefined) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function sellingPrice(variant: CatalogProductListVariantSummary | undefined): number | null | undefined {
  if (!variant) return undefined;
  return variant.effectivePriceCents === undefined ? variant.priceCents : variant.effectivePriceCents;
}

function compareAtPrice(variant: CatalogProductListVariantSummary | undefined): number | undefined {
  const current = sellingPrice(variant);
  return variant?.compareAtCents !== undefined && current !== null && current !== undefined
    && variant.compareAtCents > current ? variant.compareAtCents : undefined;
}

export function resolveProductActionPlacement(viewportWidth: number): "inline" | "topbar" {
  return viewportWidth <= 1024 ? "inline" : "topbar";
}

export function csvCell(value: string | number) {
  const text = String(value);
  const neutralized = /^(?:[\u0000-\u0020\u007f]|[\u0000-\u0020\u007f]*[=+\-@])/.test(text)
    ? `'${text}`
    : text;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export type ProductSummaryMetric = Readonly<{
  key: "total" | "active" | "draft" | "out-of-stock";
  label: "Toplam" | "Aktif" | "Kapalı" | "Stoksuz";
  value: string;
  accessibleValue: string;
}>;

const PRODUCT_SUMMARY_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "total", label: "Toplam", field: "totalProducts" }),
  Object.freeze({ key: "active", label: "Aktif", field: "activeProducts" }),
  Object.freeze({ key: "draft", label: "Kapalı", field: "draftProducts" }),
  Object.freeze({ key: "out-of-stock", label: "Stoksuz", field: "outOfStockVariants" }),
] as const);

export function productSummaryMetrics(
  summaryState: SummaryState,
  summary?: Pick<CatalogDashboardSummary, "totalProducts" | "activeProducts" | "draftProducts" | "outOfStockVariants" | "outOfStockProducts">,
): readonly ProductSummaryMetric[] {
  return Object.freeze(PRODUCT_SUMMARY_DEFINITIONS.map(({ key, label, field }) => {
    const metricValue = key === "out-of-stock" ? summary?.outOfStockProducts ?? summary?.outOfStockVariants : summary?.[field];
    if (summaryState !== "ready" || metricValue === undefined) {
      const stateLabel = summaryState === "loading" ? "yükleniyor" : "kullanılamıyor";
      return Object.freeze({ key, label, value: "—", accessibleValue: `${label} mağaza toplamı ${stateLabel}` });
    }
    const value = String(metricValue);
    return Object.freeze({ key, label, value, accessibleValue: `${label} ${value}` });
  }));
}

export function requiresBulkConfirmation(action: string): boolean {
  return action === "archive";
}

export function bulkArchiveConfirmationMessage(count: number): string {
  return `${count} ürün arşivlenecek.`;
}

export function createProductOperationCoordinator() {
  let generation = 0;
  let activeMutation: number | null = null;
  return Object.freeze({
    beginRead(): number | null {
      if (activeMutation !== null) return null;
      generation += 1;
      return generation;
    },
    invalidateReads(): void {
      if (activeMutation === null) generation += 1;
    },
    beginMutation(): number | null {
      if (activeMutation !== null) return null;
      generation += 1;
      activeMutation = generation;
      return activeMutation;
    },
    beginCanonicalRead(mutationToken: number): number | null {
      if (activeMutation !== mutationToken) return null;
      generation += 1;
      return generation;
    },
    endMutation(mutationToken: number) {
      if (activeMutation === mutationToken) activeMutation = null;
    },
    isCurrentRead(readToken: number): boolean {
      return readToken === generation;
    },
  });
}

export async function executeBulkProductAction(
  targets: readonly ProductRow[],
  action: Exclude<BulkAction, "">,
  api: BulkCatalogApi,
): Promise<Readonly<{ completed: number; failed: number }>> {
  try {
    await api.bulkMutateProducts({
      action,
      targets: Object.freeze(targets.map(({ product }) => Object.freeze({ productId: product.id, expectedVersion: product.version }))),
    });
    return Object.freeze({ completed: targets.length, failed: 0 });
  } catch {
    return Object.freeze({ completed: 0, failed: targets.length });
  }
}

function projectRows(
  products: readonly Product[],
  featuredImages: Readonly<Record<string, ProductFeaturedImage>> = Object.freeze({}),
  variantSummaries: Readonly<Record<string, CatalogProductListVariantSummary>> = Object.freeze({}),
): readonly ProductRow[] {
  return Object.freeze(products.map((product) => Object.freeze({
    product,
    ...(variantSummaries[product.id] === undefined ? {} : { variant: variantSummaries[product.id] }),
    ...(featuredImages[product.id] === undefined ? {} : { featuredImage: featuredImages[product.id] }),
  })));
}

function ProductThumbnail({ product, featuredImage }: Readonly<{ product: Product; featuredImage?: ProductFeaturedImage }>) {
  if (featuredImage === undefined) {
    return <span className="product-placeholder" aria-hidden="true"><Package /></span>;
  }
  return (
    <span className="product-thumbnail">
      <span className="product-thumbnail-fallback" aria-hidden="true"><Package /></span>
      <img
        src={featuredImage.publicUrl}
        alt={featuredImage.altText || `${product.title} ürün görseli`}
        loading="lazy"
        decoding="async"
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
    </span>
  );
}

export function ProductListConsole({
  canManage = false,
  canArchive = false,
  canDelete = false,
  canImport = false,
  initialQuery = Object.freeze({ sort: "updated-desc" }),
  initialPageSize = 20,
  initialCursor,
}: Readonly<{ canManage?: boolean; canArchive?: boolean; canDelete?: boolean; canImport?: boolean; initialQuery?: CatalogProductListQuery; initialPageSize?: CatalogProductPageSize; initialCursor?: string }>) {
  const [filter, setFilter] = useState<Filter>(initialQuery.status ?? "all");
  const [stockFilter, setStockFilter] = useState<StockFilter>(initialQuery.stock ?? "all");
  const [categoryId, setCategoryId] = useState(initialQuery.categoryId ?? "");
  const [brandId, setBrandId] = useState(initialQuery.brandId ?? "");
  const [collectionId, setCollectionId] = useState(initialQuery.collectionId ?? "");
  const [sort, setSort] = useState<Sort>(initialQuery.sort);
  const [search, setSearch] = useState(initialQuery.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(initialQuery.search ?? "");
  const [filterOpen, setFilterOpen] = useState(false);
  const [rankMode, setRankMode] = useState(false);
  const [rankDirty, setRankDirty] = useState(false);
  const [rankSaving, setRankSaving] = useState(false);
  const [rows, setRows] = useState<readonly ProductRow[]>([]);
  const [appliedQueryDigest, setAppliedQueryDigest] = useState<string>();
  const [appliedPage, setAppliedPage] = useState<string>();
  const [summary, setSummary] = useState<CatalogDashboardSummary>();
  const [summaryState, setSummaryState] = useState<SummaryState>("loading");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [nextCursor, setNextCursor] = useState<string>();
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(initialCursor);
  const currentCursorRef = useRef(currentCursor);
  currentCursorRef.current = currentCursor;
  const [cursorHistory, setCursorHistory] = useState<readonly (string | undefined)[]>([]);
  const [pageSize, setPageSize] = useState<CatalogProductPageSize>(initialPageSize);
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;
  const [catalogTotal, setCatalogTotal] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bulkOutcome, setBulkOutcome] = useState<BulkOutcome>();
  const [rowsStale, setRowsStale] = useState(false);
  const rowsStaleRef = useRef(rowsStale);
  rowsStaleRef.current = rowsStale;
  const [archiveCandidate, setArchiveCandidate] = useState<Product>();
  const [deleteCandidate, setDeleteCandidate] = useState<Product>();
  const [deletionImpact, setDeletionImpact] = useState<PermanentDeletionImpact>();
  const [deleteError, setDeleteError] = useState("");
  const deletionIntentRef = useRef<Readonly<{ productId: string; operationId: string; expectedVersion: number; confirmation: string }> | undefined>(undefined);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const wasDeleteDialogOpen = useRef(false);
  const [bulkArchiveConfirmation, setBulkArchiveConfirmation] = useState(false);
  const [quickOptions, setQuickOptions] = useState<CatalogOnboardingOptions | null>(null);
  const [quickOptionsState, setQuickOptionsState] = useState<"loading" | "ready" | "unavailable">("loading");
  const quickOptionsRequestRef = useRef<Promise<CatalogOnboardingOptions> | null>(null);
  const operationCoordinator = useRef(createProductOperationCoordinator());
  const appliedReadScope = useRef<string | undefined>(undefined);
  const queryRef = useRef<CatalogProductListQuery>(initialQuery);
  queryRef.current = Object.freeze({
    ...(debouncedSearch.trim() === "" ? {} : { search: debouncedSearch.trim() }),
    ...(filter === "all" ? {} : { status: filter }),
    ...(stockFilter === "all" ? {} : { stock: stockFilter }),
    ...(categoryId === "" ? {} : { categoryId }),
    ...(brandId === "" ? {} : { brandId }),
    ...(collectionId === "" ? {} : { collectionId }),
    sort,
  });
  const archiveDialogRef = useRef<HTMLDivElement>(null);
  const archiveCancelButtonRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);
  const refreshListButtonRef = useRef<HTMLButtonElement>(null);
  const wasArchiveDialogOpen = useRef(false);

  const requestQuickOptions = useCallback(() => {
    const pending = quickOptionsRequestRef.current;
    if (pending !== null) return pending;
    const request = catalogOnboardingClient.getOptions();
    quickOptionsRequestRef.current = request;
    const release = () => {
      if (quickOptionsRequestRef.current === request) quickOptionsRequestRef.current = null;
    };
    void request.then(release, release);
    return request;
  }, []);

  const load = useCallback(async (options: LoadOptions = {}): Promise<LoadResult> => {
    if (options.cursor !== undefined && options.cursor !== currentCursorRef.current && rowsStaleRef.current) return "blocked";
    const sequence = options.mutationToken === undefined
      ? operationCoordinator.current.beginRead()
      : operationCoordinator.current.beginCanonicalRead(options.mutationToken);
    if (sequence === null) return "blocked";
    const cursor = options.cursor;
    cursor === undefined ? setLoading(true) : setLoadingMore(true);
    if (cursor === undefined) setSummaryState((current) => current === "ready" ? current : "loading");
    if (options.mutationToken === undefined) setError("");
    try {
      const query = queryRef.current;
      const queryDigest = catalogProductListQueryDigest(query);
      const input = Object.freeze({
        ...query,
        pageSize: pageSizeRef.current,
        ...(cursor === undefined ? {} : { cursor }),
      });
      const [listOutcome, summaryOutcome] = await Promise.allSettled([
        catalogApi.listProducts(input),
        cursor === undefined ? catalogApi.getDashboardSummary() : Promise.resolve(undefined),
      ]);
      if (!operationCoordinator.current.isCurrentRead(sequence)) return "stale";
      if (cursor === undefined) {
        if (summaryOutcome.status === "fulfilled" && summaryOutcome.value !== undefined) {
          setSummary(summaryOutcome.value);
          setSummaryState("ready");
        } else {
          setSummary(undefined);
          setSummaryState("unavailable");
        }
      }
      if (listOutcome.status === "rejected") throw listOutcome.reason;
      const result = listOutcome.value;
      const projected = projectRows(result.items, result.featuredImages, result.variantSummaries);
      if (!operationCoordinator.current.isCurrentRead(sequence)) return "stale";
      setRows(projected);
      setAppliedQueryDigest(queryDigest);
      setAppliedPage(JSON.stringify([cursor ?? null, input.pageSize]));
      setNextCursor(result.nextCursor);
      setCatalogTotal(result.catalogTotal);
      const scope = JSON.stringify([queryDigest, cursor ?? null, input.pageSize]);
      const retainedScope = appliedReadScope.current === scope && options.mutationToken === undefined;
      appliedReadScope.current = scope;
      const availableIds = new Set(projected.filter(({ product }) => product.status !== "archived").map(({ product }) => product.id));
      setSelected((current) => retainedScope ? Object.freeze(current.filter((id) => availableIds.has(id))) : Object.freeze([]));
      setRowsStale(false);
      return "applied";
    } catch (failure) {
      if (!operationCoordinator.current.isCurrentRead(sequence)) return "stale";
      setError(safeMessage(failure));
      return "failed";
    } finally {
      if (operationCoordinator.current.isCurrentRead(sequence)) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized === debouncedSearch) return;
    operationCoordinator.current.invalidateReads();
    setSelected(Object.freeze([]));
    setNextCursor(undefined);
    const timer = globalThis.setTimeout(() => setDebouncedSearch(normalized), 300);
    return () => globalThis.clearTimeout(timer);
  }, [debouncedSearch, search]);

  useEffect(() => { void load({ ...(currentCursor === undefined ? {} : { cursor: currentCursor }) }); }, [brandId, categoryId, collectionId, currentCursor, debouncedSearch, filter, load, pageSize, sort, stockFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = productListUrlStateQuery({ query: queryRef.current, pageSize, ...(currentCursor === undefined ? {} : { cursor: currentCursor }) });
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query === "" ? "" : `?${query}`}${window.location.hash}`);
  }, [brandId, categoryId, collectionId, currentCursor, debouncedSearch, filter, pageSize, sort, stockFilter]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const restore = () => {
      const state = parseProductListUrlState(new URLSearchParams(window.location.search));
      setSearch(state.query.search ?? "");
      setDebouncedSearch(state.query.search ?? "");
      setFilter(state.query.status ?? "all");
      setStockFilter(state.query.stock ?? "all");
      setCategoryId(state.query.categoryId ?? "");
      setBrandId(state.query.brandId ?? "");
      setCollectionId(state.query.collectionId ?? "");
      setSort(state.query.sort);
      setPageSize(state.pageSize);
      setCurrentCursor(state.cursor);
      setCursorHistory(Object.freeze([]));
      setSelected(Object.freeze([]));
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    let current = true;
    void requestQuickOptions().then((options) => {
      if (current) {
        setQuickOptions(options);
        setQuickOptionsState("ready");
      }
    }).catch(() => {
      if (current) setQuickOptionsState("unavailable");
    });
    return () => { current = false; };
  }, [requestQuickOptions]);


  useEffect(() => {
    if (archiveCandidate !== undefined) {
      wasArchiveDialogOpen.current = true;
      archiveCancelButtonRef.current?.focus();
      return;
    }
    if (!wasArchiveDialogOpen.current) return;
    wasArchiveDialogOpen.current = false;
    if (archiveTriggerRef.current?.isConnected) archiveTriggerRef.current.focus();
    else refreshListButtonRef.current?.focus();
  }, [archiveCandidate]);

  useEffect(() => {
    if (deleteCandidate !== undefined) { wasDeleteDialogOpen.current = true; return; }
    if (!wasDeleteDialogOpen.current || busy) return;
    wasDeleteDialogOpen.current = false;
    if (deleteTriggerRef.current?.isConnected) deleteTriggerRef.current.focus();
    else refreshListButtonRef.current?.focus();
  }, [busy, deleteCandidate]);

  const currentQueryDigest = catalogProductListQueryDigest(queryRef.current);
  const sameScope = appliedQueryDigest === currentQueryDigest && appliedPage === JSON.stringify([currentCursor ?? null, pageSize]);
  const visibleRows = sameScope ? rows : Object.freeze([] as ProductRow[]);
  const knownImages = Object.fromEntries(visibleRows.flatMap(({ product, featuredImage }) => featuredImage ? [[product.id, featuredImage] as const] : []));
  const firstProductWithoutMedia = visibleRows.find(({ product, featuredImage }) => product.status !== "archived" && featuredImage === undefined)?.product;

  const visibleIds = visibleRows.filter(({ product }) => product.status !== "archived").map(({ product }) => product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const summaryMetrics = productSummaryMetrics(summaryState, summary);
  const catalogIsEmpty = (catalogTotal ?? summary?.totalProducts) === 0;
  const queryUnavailable = !loading && !loadingMore && error !== "" && !sameScope;

  function invalidateGlobalQuery(clearSelection = true) {
    operationCoordinator.current.invalidateReads();
    setNextCursor(undefined);
    setCurrentCursor(undefined);
    setCursorHistory(Object.freeze([]));
    if (clearSelection) setSelected(Object.freeze([]));
  }

  function updateSearch(value: string) {
    if (value.trim() !== debouncedSearch) invalidateGlobalQuery();
    setSearch(value);
  }

  function updateStatus(value: Filter) {
    if (value === filter) return;
    invalidateGlobalQuery();
    setFilter(value);
  }

  function updateStock(value: StockFilter) {
    if (value === stockFilter) return;
    invalidateGlobalQuery();
    setStockFilter(value);
  }

  function applySummaryFilter(key: ProductSummaryMetric["key"]) {
    const nextStatus: Filter = key === "active" || key === "draft" ? key : "all";
    const nextStock: StockFilter = key === "out-of-stock" ? "out-of-stock" : "all";
    if (nextStatus === filter && nextStock === stockFilter) return;
    invalidateGlobalQuery();
    setFilter(nextStatus);
    setStockFilter(nextStock);
  }

  function summaryFilterIsActive(key: ProductSummaryMetric["key"]): boolean {
    if (key === "total") return filter === "all" && stockFilter === "all";
    if (key === "out-of-stock") return filter === "all" && stockFilter === "out-of-stock";
    return filter === key && stockFilter === "all";
  }

  function updateCategory(value: string) {
    if (value === categoryId) return;
    invalidateGlobalQuery();
    setCategoryId(value);
  }

  function updateBrand(value: string) {
    if (value === brandId) return;
    invalidateGlobalQuery();
    setBrandId(value);
  }

  function updateCollection(value: string) {
    if (value === collectionId) return;
    invalidateGlobalQuery();
    setCollectionId(value);
  }

  function toggleRankMode() {
    if (rankSaving) return;
    if (rankMode && rankDirty && !window.confirm("Kaydedilmemiş vitrin sırası silinecek. Listeye dönülsün mü?")) return;
    setRankMode((current) => !current);
    setRankDirty(false);
  }

  function retryQuickOptions() {
    setQuickOptionsState("loading");
    void requestQuickOptions().then((options) => {
      setQuickOptions(options);
      setQuickOptionsState("ready");
    }).catch(() => setQuickOptionsState("unavailable"));
  }

  function updateSort(value: Sort) {
    if (value === sort) return;
    invalidateGlobalQuery(false);
    setSort(value);
  }

  function goNextPage() {
    if (nextCursor === undefined) return;
    setSelected(Object.freeze([]));
    if (typeof window !== "undefined") {
      const query = productListUrlStateQuery({ query: queryRef.current, pageSize, cursor: nextCursor });
      window.history.pushState(window.history.state, "", `${window.location.pathname}?${query}${window.location.hash}`);
    }
    setCursorHistory((current) => Object.freeze([...current, currentCursor]));
    setCurrentCursor(nextCursor);
  }

  function goPreviousPage() {
    const previous = cursorHistory.at(-1);
    if (cursorHistory.length === 0) return;
    setSelected(Object.freeze([]));
    if (typeof window !== "undefined") {
      const query = productListUrlStateQuery({ query: queryRef.current, pageSize, ...(previous === undefined ? {} : { cursor: previous }) });
      window.history.pushState(window.history.state, "", `${window.location.pathname}${query === "" ? "" : `?${query}`}${window.location.hash}`);
    }
    setCursorHistory((current) => Object.freeze(current.slice(0, -1)));
    setCurrentCursor(previous);
  }

  function updatePageSize(value: CatalogProductPageSize) {
    setPageSize(value);
    setCurrentCursor(undefined);
    setCursorHistory(Object.freeze([]));
    setSelected(Object.freeze([]));
  }

  function closeArchiveDialog() {
    if (!busy) setArchiveCandidate(undefined);
  }

  async function openDeleteDialog(product: Product) {
    if (!canDelete || busy) return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setDeleteCandidate(product);
    setDeletionImpact(undefined);
    setDeleteError("");
    setBusy(true);
    try {
      const impact = await catalogApi.getProductDeletionImpact(product.id);
      if (impact.resourceKind !== "product" || impact.resourceId !== product.id) throw new CatalogApiError("unavailable", 503);
      setDeletionImpact(impact);
      deletionIntentRef.current = undefined;
    } catch (failure) {
      setDeleteError(safeMessage(failure));
    } finally {
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function deleteProduct(confirmation: string) {
    if (!canDelete || !deleteCandidate || !deletionImpact || busy || confirmation !== deletionImpact.confirmationLabel) return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    const productId = deleteCandidate.id;
    const prior = deletionIntentRef.current;
    const operationId = prior?.productId === productId && prior.expectedVersion === deletionImpact.expectedVersion && prior.confirmation === confirmation
      ? prior.operationId : crypto.randomUUID();
    const command = Object.freeze({ operationId, expectedVersion: deletionImpact.expectedVersion, confirmation });
    deletionIntentRef.current = Object.freeze({ productId, ...command });
    setBusy(true);
    setDeleteError("");
    setError("");
    setBulkOutcome(undefined);
    try {
      const result = await catalogApi.deleteProduct(productId, command);
      if (!result.deleted || result.resourceKind !== "product" || result.resourceId !== productId || result.auditId !== operationId) throw new CatalogApiError("unavailable", 503);
      setRows((current) => Object.freeze(current.filter((row) => row.product.id !== productId)));
      setSelected((current) => Object.freeze(current.filter((id) => id !== productId)));
      setDeleteCandidate(undefined);
      setDeletionImpact(undefined);
      deletionIntentRef.current = undefined;
      const reconciliation = await load({ mutationToken, ...(currentCursor === undefined ? {} : { cursor: currentCursor }) });
      if (reconciliation !== "applied") setRowsStale(true);
    } catch (failure) {
      setDeleteError(safeMessage(failure));
      if (failure instanceof CatalogApiError && failure.code === "version_conflict") setDeletionImpact(undefined);
    } finally {
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  function handleArchiveDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (!busy) closeArchiveDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(archiveDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      archiveDialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !archiveDialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !archiveDialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  async function archive() {
    if (archiveCandidate === undefined || !canArchive || archiveCandidate.status === "archived") return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    let mutationCompleted = false;
    try {
      await catalogApi.archiveProduct(archiveCandidate.id, archiveCandidate.version);
      mutationCompleted = true;
      setRows((current) => Object.freeze(current.filter((item) => item.product.id !== archiveCandidate.id)));
      setArchiveCandidate(undefined);
    } catch (failure) {
      setError(safeMessage(failure));
      setArchiveCandidate(undefined);
    } finally {
      const reconciliation = await load({ mutationToken, ...(currentCursor === undefined ? {} : { cursor: currentCursor }) });
      if (mutationCompleted && reconciliation !== "applied") setRowsStale(true);
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function restore(product: Product) {
    if (!canArchive || product.status !== "archived") return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    let mutationCompleted = false;
    try {
      const result = await catalogApi.restoreProduct(product.id, product.version);
      mutationCompleted = true;
      setRows((current) => Object.freeze(current.map((row) => (
        row.product.id === product.id ? Object.freeze({ ...row, product: result.product }) : row
      ))));
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      const reconciliation = await load({ mutationToken, ...(currentCursor === undefined ? {} : { cursor: currentCursor }) });
      if (mutationCompleted && reconciliation !== "applied") setRowsStale(true);
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function setProductStatus(product: Product, status: "draft" | "active") {
    if (!canManage || product.status === "archived") return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    let mutationCompleted = false;
    try {
      const result = await catalogApi.setProductStatus(product.id, product.version, status);
      mutationCompleted = true;
      setRows((current) => Object.freeze(current.map((row) => (
        row.product.id === product.id ? Object.freeze({ ...row, product: result.product }) : row
      ))));
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      const reconciliation = await load({ mutationToken, ...(currentCursor === undefined ? {} : { cursor: currentCursor }) });
      if (mutationCompleted && reconciliation !== "applied") setRowsStale(true);
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function executeConfirmedBulkAction() {
    if (
      bulkAction === "" || selected.length === 0 ||
      (bulkAction === "archive" ? !canArchive : !canManage)
    ) return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    try {
      const targets = rows.filter(({ product }) => selected.includes(product.id));
      const outcome = await executeBulkProductAction(targets, bulkAction, catalogApi);
      setSelected(Object.freeze([]));
      setBulkArchiveConfirmation(false);
      const reconciliation = await load({ mutationToken, ...(currentCursor === undefined ? {} : { cursor: currentCursor }) });
      const reconciliationState = reconciliation === "applied" ? "succeeded" : "failed";
      setBulkOutcome(Object.freeze({ ...outcome, reconciliation: reconciliationState }));
      if (reconciliationState === "failed" && outcome.completed > 0) setRowsStale(true);
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  function applyBulkAction() {
    if (
      bulkAction === "" || selected.length === 0 || busy ||
      (bulkAction === "archive" ? !canArchive : !canManage)
    ) return;
    if (requiresBulkConfirmation(bulkAction)) {
      setBulkArchiveConfirmation(true);
      return;
    }
    void executeConfirmedBulkAction();
  }

  async function retryStaleRows() {
    await load({ ...(currentCursor === undefined ? {} : { cursor: currentCursor }) });
  }

  function exportVisibleRows() {
    if (visibleRows.some(({ variant }) => variant && (
      variant.pricingMethod && variant.pricingMethod !== "fixed_try" ||
      variant.effectivePriceCents === null ||
      variant.effectivePriceCents !== undefined && variant.effectivePriceCents !== variant.priceCents
    ))) {
      setError("Dinamik veya fiyat listesiyle değişen ürünler eski sabit fiyat CSV biçimine güvenle aktarılamaz. Bu ürünleri dışa aktarmak için fiyat politikası destekli aktarım gerekir.");
      return;
    }
    setError("");
    const output = [
      ["Ürün", "SKU", "Fiyat", "Stok", "Durum"],
      ...visibleRows.map(({ product, variant }) => [
        product.title,
        variant?.sku ?? "",
        variant === undefined ? "" : String(variant.priceCents),
        productStockPresentation(variant).csvValue,
        STATUS_LABELS[product.status],
      ]),
    ].map((line) => line.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", output], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "celebix-urunler.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function productCommands() {
    return (
    <div className="hemenaku-product-commandbar product-operations-commandbar" aria-label="Ürün sayfası işlemleri">
      {canImport ? <Link className="command-button" href="/products/bulk-upload"><FileUp aria-hidden="true" />İçe Aktar</Link> : null}
      <button className="command-button" type="button" disabled={visibleRows.length === 0 || busy || loading || loadingMore} onClick={exportVisibleRows}><Download aria-hidden="true" />Dışa Aktar</button>
      {canManage ? <Link className={`command-button command-button-primary ${catalogStyles.primaryAction}`} href="/products/new"><Plus aria-hidden="true" />Ürün Ekle</Link> : null}
    </div>
    );
  }

  const topbarActions = productCommands();
  const activeFilters = [
    ...(search.trim() === "" ? [] : [{ key: "search", label: `Arama: ${search.trim()}`, clear: () => updateSearch("") }]),
    ...(filter === "all" ? [] : [{ key: "status", label: STATUS_LABELS[filter], clear: () => updateStatus("all") }]),
    ...(stockFilter === "all" ? [] : [{ key: "stock", label: stockFilter === "in-stock" ? "Stokta" : stockFilter === "out-of-stock" ? "Stoksuz" : "Stok takibi kapalı", clear: () => updateStock("all") }]),
    ...(categoryId === "" ? [] : [{ key: "category", label: `Kategori: ${quickOptions?.categories.find((category) => category.id === categoryId)?.name ?? "Seçili kategori"}`, clear: () => updateCategory("") }]),
    ...(brandId === "" ? [] : [{ key: "brand", label: `Marka: ${quickOptions?.resources.find((resource) => resource.kind === "brand" && resource.id === brandId)?.name ?? "Seçili marka"}`, clear: () => updateBrand("") }]),
    ...(collectionId === "" ? [] : [{ key: "collection", label: `Koleksiyon: ${quickOptions?.resources.find((resource) => resource.kind === "collection" && resource.id === collectionId)?.name ?? "Seçili koleksiyon"}`, clear: () => updateCollection("") }]),
  ];

  return (
    <section className={`catalog-page donor-product-page product-operations-page ${catalogStyles.catalogRoot} ${listStyles.root}`} tabIndex={-1} aria-labelledby="products-title" data-presentation="hemenaku-product-list" data-workspace="product-operations" data-mode={rankMode ? "rank" : "list"}>
      <PanelTopbarBridge title="Ürünler" actions={topbarActions} />
      <h1 id="products-title" className="sr-only">Ürünler</h1>
      <div className="product-mobile-commandbar">{productCommands()}</div>

      <div className={listStyles.workspace}>
        <div className="product-stat-grid" role="group" aria-label="Ürün özeti filtreleri">
          {summaryMetrics.map((metric) => (
            <button
              key={metric.key}
              type="button"
              className={summaryFilterIsActive(metric.key) ? "is-active" : ""}
              data-summary-filter={metric.key}
              aria-label={`${metric.accessibleValue}; filtreyi uygula`}
              aria-pressed={summaryFilterIsActive(metric.key)}
              disabled={busy || loading || loadingMore}
              onClick={() => applySummaryFilter(metric.key)}
            >
              <span className="product-stat-label">{metric.label}</span>
              <span className="product-stat-value">{metric.value}</span>
            </button>
          ))}
        </div>
      <div className="hemenaku-product-filters product-operations-toolbar">
        <label className="product-search"><Search aria-hidden="true" /><span className="sr-only">Tabloda arama yapın; tüm katalogda ürün, slug, SKU veya barkod arayın</span><input value={search} disabled={busy} onChange={(event) => updateSearch(event.target.value)} placeholder="Ürün, slug, SKU veya barkod ara" aria-label="Ürün tablosunda ara" /></label>
        <label className="command-select"><ArrowDownUp aria-hidden="true" /><span className="sr-only">Sırala</span><select value={sort} disabled={busy || loading || loadingMore} onChange={(event) => updateSort(event.target.value as Sort)} aria-label="Ürünleri sırala"><option value="updated-desc">Son güncellenen</option><option value="title-asc">İsim A-Z</option><option value="title-desc">İsim Z-A</option><option value="created-desc">En yeni</option><option value="created-asc">En eski</option></select></label>
        <button className={`command-button ${filterOpen || filter !== "all" || stockFilter !== "all" || categoryId !== "" || brandId !== "" || collectionId !== "" ? "is-active" : ""}`} type="button" aria-expanded={filterOpen} aria-pressed={filter !== "all" || stockFilter !== "all" || categoryId !== "" || brandId !== "" || collectionId !== ""} disabled={busy || loading || loadingMore} onClick={() => setFilterOpen((current) => !current)}><FilterIcon aria-hidden="true" />Filtre</button>
        <button ref={refreshListButtonRef} className="command-button command-icon-button" type="button" disabled={busy || loading || loadingMore} onClick={() => void load({ ...(currentCursor === undefined ? {} : { cursor: currentCursor }) })} aria-label="Ürün listesini yenile" title="Ürün listesini yenile"><RefreshCw aria-hidden="true" /></button>
        {canManage ? <button className={`command-button product-rank-toggle ${rankMode ? "is-active" : ""}`} type="button" aria-pressed={rankMode} aria-expanded={rankMode} disabled={rankSaving} onClick={toggleRankMode}><GripVertical aria-hidden="true" />Vitrin sırası</button> : null}
      </div>

      {activeFilters.length > 0 ? <div className={listStyles.activeFilters} aria-label="Uygulanan ürün filtreleri">
        {activeFilters.map((activeFilter) => <button key={activeFilter.key} type="button" disabled={busy || loading || loadingMore} onClick={activeFilter.clear} aria-label={`${activeFilter.label} filtresini kaldır`}><span>{activeFilter.label}</span><X aria-hidden="true" /></button>)}
        <button className={listStyles.clearFilters} type="button" disabled={busy || loading || loadingMore} onClick={() => { updateSearch(""); updateStatus("all"); updateStock("all"); updateCategory(""); updateBrand(""); updateCollection(""); }}>Tümünü temizle</button>
      </div> : null}

      {summaryState === "ready" && (summary?.productsWithoutMedia ?? 0) > 0 ? <div className="product-media-notice" role="status"><span className="product-media-notice-icon" aria-hidden="true"><ImageOff /></span><span><strong>{summary?.productsWithoutMedia} üründe görsel eksik</strong><small>Mağaza vitrini için görselleri tamamlayın.</small></span>{firstProductWithoutMedia ? <Link href={`/products/${firstProductWithoutMedia.id}`} className="product-media-notice-link">İlk eksik ürüne git <span aria-hidden="true">→</span></Link> : null}</div> : null}

      {rankMode ? <ProductCategoryRankConsole categories={quickOptions?.categories ?? []} initialCategoryId={categoryId} knownImages={knownImages} optionsState={quickOptionsState} onRetryOptions={retryQuickOptions} onDirtyChange={setRankDirty} onSavingChange={setRankSaving} onClose={toggleRankMode} /> : <>

      {filterOpen ? (
        <div className="product-filter-panel" aria-label="Ürün durumu filtresi">
          <div role="group" aria-label="Ürün durumu">
            {(["all", "active", "draft", "archived"] as const).map((status) => <button key={status} type="button" disabled={busy || loading || loadingMore} className={filter === status ? "is-active" : ""} onClick={() => updateStatus(status)}>{status === "all" ? "Tümü" : STATUS_LABELS[status]}</button>)}
          </div>
          <label><span>Stok</span><select aria-label="Stok filtresi" value={stockFilter} disabled={busy || loading || loadingMore} onChange={(event) => updateStock(event.target.value as StockFilter)}><option value="all">Tüm stok durumları</option><option value="in-stock">Stokta</option><option value="out-of-stock">Stoksuz</option><option value="untracked">Stok takibi kapalı</option></select></label>
          <label><span>Kategori</span><select aria-label="Kategori filtresi" value={categoryId} disabled={busy || loading || loadingMore || quickOptionsState !== "ready"} onChange={(event) => updateCategory(event.target.value)}><option value="">{quickOptionsState === "unavailable" ? "Seçenekler yüklenemedi" : "Tüm kategoriler"}</option>{quickOptions?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label><span>Marka</span><select aria-label="Marka filtresi" value={brandId} disabled={busy || loading || loadingMore || quickOptionsState !== "ready"} onChange={(event) => updateBrand(event.target.value)}><option value="">{quickOptionsState === "unavailable" ? "Seçenekler yüklenemedi" : "Tüm markalar"}</option>{quickOptions?.resources.filter((resource) => resource.kind === "brand").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
          <label><span>Koleksiyon</span><select aria-label="Koleksiyon filtresi" value={collectionId} disabled={busy || loading || loadingMore || quickOptionsState !== "ready"} onChange={(event) => updateCollection(event.target.value)}><option value="">{quickOptionsState === "unavailable" ? "Seçenekler yüklenemedi" : "Tüm koleksiyonlar"}</option>{quickOptions?.resources.filter((resource) => resource.kind === "collection").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
          {quickOptionsState === "unavailable" ? <p role="status">Kategori, marka ve koleksiyon seçenekleri yüklenemedi.</p> : null}
        </div>
      ) : null}

      <div className="product-bulkbar">
        {(canManage || canArchive) && filter !== "archived" ? <div className="product-bulk-actions">
          <label className="select-all-control"><input type="checkbox" disabled={busy || loading || loadingMore} checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? Object.freeze(visibleIds) : Object.freeze([]))} aria-label="Görüntülenen tüm ürünleri seç" /><span>Tümünü seç</span></label>
          {selected.length > 0 ? <>
          <select value={bulkAction} disabled={busy || loading || loadingMore} onChange={(event) => setBulkAction(event.target.value as BulkAction)} aria-label="Toplu İşlemler"><option value="">Toplu İşlemler</option>{canManage ? <><option value="active">Aktif yap</option><option value="draft">Taslağa al</option></> : null}{canArchive ? <option value="archive">Arşivle</option> : null}</select>
          <button className={catalogStyles.bulkActionButton} type="button" disabled={selected.length === 0 || bulkAction === "" || busy || loading || loadingMore} onClick={applyBulkAction}>Uygula</button>
          <span className="product-selected-count">{selected.length} ürün seçildi</span>
          </> : null}
        </div> : null}
        <div className="product-list-status">
          <span className="product-range">{visibleRows.length === 0 ? 0 : 1} - {visibleRows.length} / {catalogTotal ?? "—"} sonuç</span>
          <label className="row-count-control"><span>Satır sayısı</span><select aria-label="Satır sayısı" value={pageSize} disabled={busy || loading || loadingMore} onChange={(event) => updatePageSize(Number(event.currentTarget.value) as CatalogProductPageSize)}><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label>
        </div>
      </div>

      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Bir sorun oluştu</strong><p>{error}</p></div><button className="button button-secondary" type="button" onClick={() => void load({ ...(currentCursor === undefined ? {} : { cursor: currentCursor }) })}>Tekrar dene</button></div> : null}
      {bulkOutcome ? <div className={`feedback ${bulkOutcome.failed > 0 || bulkOutcome.reconciliation === "failed" ? "feedback-error" : "feedback-success"}`} role={bulkOutcome.failed > 0 || bulkOutcome.reconciliation === "failed" ? "alert" : "status"}><div><strong>Toplu işlem sonucu</strong><p>{bulkOutcome.completed} tamamlandı, {bulkOutcome.failed} başarısız. {bulkOutcome.reconciliation === "succeeded" ? "Liste kalıcı mağaza durumuyla uzlaştırıldı." : "Kanonik uzlaştırma başarısız; görüntülenen satırlar güncel olmayabilir. Yeniden deneyin."}</p></div></div> : null}
      {rowsStale ? <div id="product-stale-warning" className="feedback feedback-error" role="alert"><div><strong>Ürün satırları doğrulanamadı</strong><p>Uzlaştırma başarısız; görüntülenen satırlar güncel olmayabilir.</p></div><button className="button button-secondary" type="button" onClick={() => void retryStaleRows()} disabled={loading || busy}>Yeniden dene</button></div> : null}

      <div className={catalogStyles.listBody} aria-busy={loading || loadingMore}>
      {(loading || loadingMore) && !sameScope ? (
        <div className={catalogStyles.listLoading} role="status" aria-live="polite">
          <span className="sr-only">Ürünler yükleniyor…</span>
          <div className={catalogStyles.loadingHeader} aria-hidden="true" />
          <div aria-hidden="true">{Array.from({ length: 8 }, (_, index) => (
            <div className={catalogStyles.loadingRow} key={index}><span /><span /><span /><span /></div>
          ))}</div>
        </div>
      ) : queryUnavailable ? (
        <div className="empty-state"><span className="empty-state-mark" aria-hidden="true"><Search /></span><h2>Bu sorgunun ürünleri yüklenemedi</h2><p>Önceki sorgunun satırları güvenlik için gizlendi. Yeniden deneyin.</p></div>
      ) : visibleRows.length === 0 ? (
        catalogIsEmpty ? (
          <div className="empty-state"><span className="empty-state-mark" aria-hidden="true"><Package /></span><h2>Henüz ürün yok</h2><p>Kataloğunuzdaki ilk ürünü oluşturarak başlayın.</p>{canManage ? <Link className="button button-primary" href="/products/new">İlk ürünü oluştur</Link> : null}</div>
        ) : (
          <div className="empty-state"><span className="empty-state-mark" aria-hidden="true"><Search /></span><h2>Aramanızla eşleşen ürün bulunamadı</h2><p>Arama terimini veya global filtreleri değiştirip yeniden deneyin.</p></div>
        )
      ) : (
        <div className="catalog-table-shell" role="region" aria-label="Ürün karşılaştırma tablosu" aria-busy={loading || loadingMore} tabIndex={0} data-stale={rowsStale ? "true" : undefined} aria-describedby={rowsStale ? "product-stale-warning" : undefined}>
          <table className="catalog-table">
            <thead><tr><th>Seç</th><th>Ürün</th><th>SKU</th><th>Fiyat</th><th>Stok</th><th>Durum</th><th>Yayında</th><th>İşlemler</th></tr></thead>
            <tbody>
              {visibleRows.map(({ product, variant, featuredImage }) => (
                <tr key={product.id} className={selected.includes(product.id) ? "is-selected" : undefined}>
                  <td data-label="Seç"><label className="catalog-checkbox-hit"><input type="checkbox" disabled={busy || product.status === "archived"} checked={selected.includes(product.id)} onChange={(event) => setSelected((current) => event.target.checked ? Object.freeze([...current, product.id]) : Object.freeze(current.filter((id) => id !== product.id)))} aria-label={`${product.title} ürününü seç`} /></label></td>
                  <td data-label="Ürün"><Link className="product-link" href={`/products/${product.id}`}><ProductThumbnail product={product} featuredImage={featuredImage} /><span><strong>{product.title}</strong></span></Link></td>
                  <td data-label="SKU"><span className="mono-value">{variant?.sku ?? "—"}</span></td>
                  <td data-label="Fiyat">{compareAtPrice(variant) !== undefined ? <del>{money(compareAtPrice(variant), product.currency)}</del> : null}<span className="product-price">{money(sellingPrice(variant), product.currency)}</span></td>
                  <td data-label="Stok"><span className={productStockPresentation(variant).className}>{productStockPresentation(variant).label}</span></td>
                  <td data-label="Durum"><span className={`product-status-text status-${product.status}`}>{STATUS_LABELS[product.status]}</span>{product.status === "draft" ? <small className="sr-only">Henüz yayına hazır değil</small> : null}</td>
                  <td data-label="Yayında">{canManage && product.status !== "archived" ? <button className={`publish-switch ${product.status === "active" ? "is-active" : ""}`} type="button" role="switch" aria-checked={product.status === "active"} disabled={busy || loading || loadingMore} onClick={() => void setProductStatus(product, product.status === "active" ? "draft" : "active")} aria-label={`${product.title} yayın durumunu değiştir`}><span /></button> : <span aria-label="Yayın değişikliği kullanılamıyor">—</span>}</td>
                  <td className="row-actions" data-label="İşlemler">
                    <div className={listStyles.rowActions}>
                      {canManage && product.status !== "archived" ? <Link className={`icon-button ${listStyles.editAction}`} href={`/products/${product.id}`} aria-label={`${product.title} ürününü düzenle`} title="Düzenle"><Pencil /><span>Düzenle</span></Link> : null}
                      <details className={listStyles.rowDisclosure} name="product-row-actions" onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        event.currentTarget.open = false;
                        event.currentTarget.querySelector("summary")?.focus();
                      }}>
                        <summary aria-label={`${product.title} için diğer işlemler`} title="Diğer işlemler"><MoreHorizontal aria-hidden="true" /></summary>
                        <div className={listStyles.rowMenu}>
                          <Link className="icon-button" href={`/products/${product.id}`} aria-label={`${product.title} ürününü görüntüle`} title="Görüntüle"><Eye /></Link>
                          {product.status !== "archived" ? <Link className="icon-button" href={`/products/barcode-labels?productId=${product.id}`} aria-label={`${product.title} için barkod etiketi hazırla`} title="Barkod etiketi hazırla"><ScanBarcode /></Link> : null}
                          {canArchive && product.status !== "archived" ? <button className="icon-button danger" type="button" disabled={busy || loading || loadingMore} onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveCandidate(product); }} aria-label={`${product.title} ürününü arşivle`} title="Arşivle"><Archive /></button> : null}
                          {canDelete ? <button className="icon-button danger" type="button" disabled={busy || loading || loadingMore} onClick={(event) => { deleteTriggerRef.current = event.currentTarget; void openDeleteDialog(product); }} aria-label={`${product.title} ürününü kalıcı sil`} title="Kalıcı sil"><Trash2 /></button> : null}
                          {canArchive && product.status === "archived" ? <button className="button button-secondary" type="button" disabled={busy || loading || loadingMore} onClick={() => void restore(product)}><RotateCcw aria-hidden="true" />{"Geri Yükle"}</button> : null}
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      </div>

      <nav className="product-pagination" aria-label="Ürün sayfaları"><button className="button button-secondary" type="button" onClick={goPreviousPage} disabled={cursorHistory.length === 0 || loadingMore || loading || busy || rowsStale}>Önceki</button><button className="button button-secondary" type="button" onClick={goNextPage} disabled={nextCursor === undefined || loadingMore || loading || busy || rowsStale}>{loadingMore ? "Yükleniyor…" : "Sonraki"}</button></nav>

      {deleteCandidate && canDelete ? <PermanentDeleteDialog
        key={deleteCandidate.id}
        impact={deletionImpact}
        resourceLabel="Ürün"
        busy={busy}
        error={deleteError}
        onRetry={() => { void openDeleteDialog(deleteCandidate); }}
        onCancel={() => { if (!busy) { setDeleteCandidate(undefined); setDeletionImpact(undefined); setDeleteError(""); } }}
        onConfirm={(confirmation) => { void deleteProduct(confirmation); }}
      /> : null}

      {archiveCandidate && canArchive ? (
        <div className="archive-dialog-layer">
          <div ref={archiveDialogRef} className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-title" aria-describedby="archive-description" tabIndex={-1} onKeyDown={handleArchiveDialogKeyDown}>
            <div><strong id="archive-title">Arşivlemeyi onayla</strong><p id="archive-description"><b>{archiveCandidate.title}</b><br />Bu ürün mağazada görünmez olacaktır.<br /><br />Sipariş geçmişi korunacaktır.<br /><br />Bu işlem daha sonra geri alınabilir.</p></div>
            <div className="confirmation-actions"><button ref={archiveCancelButtonRef} className="button button-secondary" type="button" onClick={closeArchiveDialog} disabled={busy || loading || loadingMore}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void archive()} disabled={busy || loading || loadingMore}>{busy ? "Arşivleniyor…" : "Ürünü arşivle"}</button></div>
          </div>
        </div>
      ) : null}

      {bulkArchiveConfirmation && canArchive ? (
        <div className="archive-dialog-layer">
          <BulkArchiveDialogFocus busy={busy} onCancel={() => setBulkArchiveConfirmation(false)} fallbackFocus={() => {
            const refresh = refreshListButtonRef.current;
            if (refresh && !refresh.disabled) refresh.focus();
            else refresh?.closest<HTMLElement>("section")?.focus();
          }}>
            <div><strong id="bulk-archive-title">Toplu arşivlemeyi onayla</strong><p id="bulk-archive-description">{bulkArchiveConfirmationMessage(selected.length)}<br />Bu ürün mağazada görünmez olacaktır.<br /><br />Sipariş geçmişi korunacaktır.<br /><br />Bu işlem daha sonra geri alınabilir.</p></div>
            <div className="confirmation-actions"><button className="button button-secondary" type="button" onClick={() => setBulkArchiveConfirmation(false)} disabled={busy || loading || loadingMore}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void executeConfirmedBulkAction()} disabled={busy || loading || loadingMore}>{busy ? "Arşivleniyor…" : `${selected.length} ürünü arşivle`}</button></div>
          </BulkArchiveDialogFocus>
        </div>
      ) : null}

      </>}
      </div>
    </section>
  );
}

function BulkArchiveDialogFocus({ busy, onCancel, fallbackFocus, children }: Readonly<{ busy: boolean; onCancel(): void; fallbackFocus(): void; children: ReactNode }>) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const cancelRef = useRef(onCancel);
  const fallbackFocusRef = useRef(fallbackFocus);
  busyRef.current = busy;
  cancelRef.current = onCancel;
  fallbackFocusRef.current = fallbackFocus;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = dialog.ownerDocument.activeElement as HTMLElement | null;
    dialog.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
      else fallbackFocusRef.current();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busyRef.current) cancelRef.current();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    const activeElement = dialog?.ownerDocument.activeElement;
    if (event.shiftKey && (activeElement === first || !dialog?.contains(activeElement ?? null))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeElement === last || !dialog?.contains(activeElement ?? null))) {
      event.preventDefault();
      first.focus();
    }
  }

  return <div ref={dialogRef} className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bulk-archive-title" aria-describedby="bulk-archive-description" tabIndex={-1} onKeyDown={handleKeyDown}>{children}</div>;
}
