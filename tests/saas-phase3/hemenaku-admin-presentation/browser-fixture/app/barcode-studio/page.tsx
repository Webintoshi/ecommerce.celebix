import { BarcodeLabelStudio } from "@/components/catalog-admin/BarcodeLabelStudio";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../mira-catalog/catalog-fixture";
import { BARCODE_STORE_NAME } from "./fixture-data";

export default async function BarcodeStudioFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <PanelLayoutClient model={MODEL}>
      <BarcodeLabelStudio canManage={query.readonly !== "1"} storeName={BARCODE_STORE_NAME} />
    </PanelLayoutClient>
  );
}
