import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PromotionAnalytics } from "@/components/promotions/PromotionAnalytics";
import { PromotionCodes } from "@/components/promotions/PromotionCodes";
import { PromotionStudio } from "@/components/promotions/PromotionStudio";

import { MODEL } from "../../mira-catalog/catalog-fixture";
import { PROMOTION_ID, PROMOTION_TIMEZONE } from "../promotions-fixture";
import styles from "../fixture.module.css";

export type PromotionFixtureView = "list" | "new" | "detail" | "edit" | "codes" | "analytics";

export function PromotionFixtureScreen({ view, promotionId = PROMOTION_ID }: Readonly<{ view: PromotionFixtureView; promotionId?: string }>) {
  const page = view === "new"
    ? <PromotionStudio mode="create" timezone={PROMOTION_TIMEZONE} canManage canPublish canArchive />
    : view === "detail"
      ? <PromotionStudio mode="view" promotionId={promotionId} timezone={PROMOTION_TIMEZONE} canManage canPublish canArchive />
      : view === "edit"
        ? <PromotionStudio mode="edit" promotionId={promotionId} timezone={PROMOTION_TIMEZONE} canManage canPublish canArchive />
        : view === "codes"
          ? <PromotionCodes promotionId={promotionId} timezone={PROMOTION_TIMEZONE} storefrontOrigin={null} canPublish canExportCodes />
          : view === "analytics"
            ? <PromotionAnalytics promotionId={promotionId} />
            : <PromotionStudio mode="list" timezone={PROMOTION_TIMEZONE} canManage canPublish canArchive />;

  return <PanelLayoutClient model={MODEL}>
    <div className={styles.evidence} data-evidence="isolated-promotions-fixture">
      <p className={styles.notice} role="note">Kontrollü sunum fixture&apos;ı · canlı kampanya verisi veya gerçek performans hesabı değildir.</p>
      {page}
    </div>
  </PanelLayoutClient>;
}

export default async function MiraPromotionsFixture({ params }: Readonly<{ params: Promise<{ view: string }> }>) {
  const { view } = await params;
  const selected: PromotionFixtureView = ["list", "new", "detail", "edit", "codes", "analytics"].includes(view) ? view as PromotionFixtureView : "list";
  return <PromotionFixtureScreen view={selected} />;
}
