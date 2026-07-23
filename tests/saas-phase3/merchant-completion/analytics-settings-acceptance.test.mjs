import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const source = (file) => readFile(path.join(ROOT, file), "utf8");
const secretNames = Object.freeze([
  ["smtp", "Password"].join(""),
  ["api", "Key"].join(""),
  ["push", "Token"].join(""),
]);

test("analytics and typed storefront settings retain durable authority boundaries", async () => {
  const [analyticsSql, analyticsRepository, analyticsRuntime, analyticsHandler, analyticsClient, analyticsPage, settingsSql, settingsValidation, notificationPage, heroPage, promotionPage, marqueePage, merchantConsole] = await Promise.all([
    source("apps/owner/scripts/sql/saas/202607220038_merchant_analytics.up.sql"),
    source("packages/saas-data/src/analytics/repository.ts"),
    source("apps/customer-panel/lib/server-analytics/runtime.ts"),
    source("apps/customer-panel/lib/analytics-http/handler.ts"),
    source("apps/customer-panel/components/analytics/AnalyticsDashboard.tsx"),
    source("apps/customer-panel/app/analytics/page.tsx"),
    source("apps/owner/scripts/sql/saas/202607220039_typed_storefront_settings.up.sql"),
    source("packages/saas-data/src/merchant-admin/validation.ts"),
    source("apps/customer-panel/app/settings/notifications/page.tsx"),
    source("apps/customer-panel/app/settings/hero-banner/page.tsx"),
    source("apps/customer-panel/app/settings/promotion-banner/page.tsx"),
    source("apps/customer-panel/app/settings/marquee/page.tsx"),
    source("apps/customer-panel/components/merchant-admin/MerchantModuleConsole.tsx"),
  ]);

  assert.match(analyticsSql, /CREATE FUNCTION saas\.merchant_analytics_dashboard\([\s\S]*?SECURITY DEFINER SET search_path=pg_catalog,saas/);
  assert.match(analyticsSql, /e:=saas\.merchant_action_authority_error\(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics\.read'\)/);
  assert.match(analyticsSql, /FROM saas\.orders WHERE store_id=p_store_id/);
  assert.match(analyticsSql, /GRANT EXECUTE ON FUNCTION saas\.merchant_analytics_dashboard\([^)]*\) TO celebix_saas_app/);
  assert.doesNotMatch(analyticsSql, /GRANT EXECUTE ON FUNCTION saas\.merchant_analytics_(?:series|top_products)/);

  assert.match(analyticsRepository, /BEGIN READ ONLY/);
  assert.match(analyticsRepository, /SET LOCAL ROLE celebix_saas_app/);
  assert.match(analyticsRepository, /SELECT outcome,result_payload FROM saas\.merchant_analytics_dashboard\(/);
  assert.match(analyticsRuntime, /access\.readiness\.mode !== "approved_staging"/);
  assert.match(analyticsRuntime, /Object\.freeze\(\{ dashboard: repository\.dashboard\.bind\(repository\) \}\)/);
  assert.match(analyticsHandler, /runtime\.access\.resolveCredential\(\{ credential: cookie\.credential, requestId, now: new Date\(now\) \}\)/);
  assert.match(analyticsHandler, /tenantContext: access\.tenantContext/);
  assert.match(analyticsHandler, /PRIVATE_HEADERS/);
  assert.match(analyticsHandler, /cache-control", "no-store"/);

  assert.doesNotMatch(analyticsClient, /TenantContext|principalId|membershipId|planId|storeId|x-store-id|x-tenant-id|dangerouslySetInnerHTML/);
  for (const unsupportedMetric of ["Canlı ziyaretçi", "Dönüşüm oranı", "Cihaz dağılımı", "Trafik kaynağı"]) assert.doesNotMatch(analyticsClient, new RegExp(unsupportedMetric));
  assert.match(analyticsPage, /await requireServerPanelAccess\(\)/);
  assert.match(analyticsPage, /"analytics\.read"/);

  for (const kind of ["notification_setting", "hero_banner", "promotion_banner", "marquee_setting"]) {
    assert.match(settingsSql, new RegExp(`'${kind}'`));
    assert.match(settingsValidation, new RegExp(`${kind}:\\[`));
  }
  assert.match(settingsSql, /merchant_admin_authority_error\([^;]+r\.record_kind,true\)/);
  assert.match(settingsSql, /pg_advisory_xact_lock/);
  for (const name of secretNames) {
    assert.doesNotMatch(settingsValidation, new RegExp(name));
    assert.doesNotMatch(settingsSql, new RegExp(name));
  }

  for (const [page, kind] of [[notificationPage, "notification_setting"], [heroPage, "hero_banner"], [promotionPage, "promotion_banner"], [marqueePage, "marquee_setting"]]) {
    assert.match(page, /await requireServerPanelAccess\(\)/);
    assert.match(page, new RegExp(`kind="${kind}"`));
  }
  assert.match(merchantConsole, /status === "awaiting_provider_activation"/);
  assert.doesNotMatch(merchantConsole, /(?:provider|marketplace)[\s\S]{0,80}(?:success|complete|synchroni[sz]ed)/i);
});
