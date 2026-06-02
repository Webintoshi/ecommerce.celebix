import "server-only";

import { shouldUseLightPostgresAdmin } from "@/lib/db/admin-database-mode";

export const DERYCRAFT_TEMPORARILY_DISABLED_CODE = "temporarily_disabled";
export const DERYCRAFT_REQUIRES_LIGHT_POSTGRES_SUPPORT_CODE = "requires_light_postgres_support";

export function isAdminAnalyticsWriteDisabled() {
  return shouldUseLightPostgresAdmin();
}

export function isAdminQuickOrderDisabled() {
  return shouldUseLightPostgresAdmin();
}

export function isAdminAbandonedCartDisabled() {
  return shouldUseLightPostgresAdmin();
}

export function isAdminProductReviewsDisabled() {
  return shouldUseLightPostgresAdmin();
}
