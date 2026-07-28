import { handleDefaultCatalogOnboardingCreateCategory, handleDefaultCatalogOnboardingListCategories } from "../../../../../lib/catalog-onboarding-http/default.ts";

export const GET = handleDefaultCatalogOnboardingListCategories;
export const POST = handleDefaultCatalogOnboardingCreateCategory;
