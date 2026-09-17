import { BarcodeLabelStudio } from "@/components/catalog-admin/BarcodeLabelStudio";
import { CatalogBulkImportConsole } from "@/components/catalog-admin/CatalogBulkImportConsole";
import { CatalogImportPreparationConsole } from "@/components/catalog-admin/CatalogImportPreparationConsole";
import { InventoryCountConsole } from "@/components/inventory/InventoryCountConsole";
import { InventoryTransferConsole } from "@/components/inventory/InventoryTransferConsole";
import { PurchasingConsole } from "@/components/inventory/PurchasingConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PriceListConsole } from "@/components/pricing/PriceListConsole";

import { MODEL } from "../../mira-catalog/catalog-fixture";
import { COUNT, PRICE_LIST, PURCHASE, TRANSFER } from "../stock-fixture";

export default async function MiraStockFixture({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  let page;
  if (view === "purchasing") page = <PurchasingConsole canManage initialItems={[PURCHASE]} />;
  else if (view === "purchasing-detail") page = <PurchasingConsole canManage initial={PURCHASE} />;
  else if (view === "purchasing-new") page = <PurchasingConsole canManage mode="new" />;
  else if (view === "counts") page = <InventoryCountConsole canManage initialItems={[COUNT]} />;
  else if (view === "count-detail") page = <InventoryCountConsole canManage initial={COUNT} />;
  else if (view === "count-new") page = <InventoryCountConsole canManage mode="new" />;
  else if (view === "transfers") page = <InventoryTransferConsole canManage initialItems={[TRANSFER]} />;
  else if (view === "transfer-detail") page = <InventoryTransferConsole canManage initial={TRANSFER} />;
  else if (view === "transfer-new") page = <InventoryTransferConsole canManage mode="new" />;
  else if (view === "price-lists") page = <PriceListConsole canRead canManage initialItems={[PRICE_LIST]} initialTags={[]} />;
  else if (view === "price-list-detail") page = <PriceListConsole canRead canManage mode="detail" resourceId={PRICE_LIST.id} />;
  else if (view === "price-list-new") page = <PriceListConsole canRead canManage mode="new" />;
  else if (view === "bulk-import") page = <CatalogBulkImportConsole canImport />;
  else if (view === "shopify-import") page = <CatalogImportPreparationConsole canImport format="shopify_csv" title="Shopify Dönüştürücü" description="Kontrollü yerel Shopify CSV önizlemesi." />;
  else if (view === "barcode") page = <BarcodeLabelStudio canManage storeName="mira-stock-fixture" />;
  else page = <CatalogImportPreparationConsole canImport format="native_csv" title="Otomatik Yükle" description="Kontrollü yerel CSV önizlemesi." />;

  return <PanelLayoutClient model={MODEL}><div data-evidence="isolated-stock-fixture">{page}</div></PanelLayoutClient>;
}
