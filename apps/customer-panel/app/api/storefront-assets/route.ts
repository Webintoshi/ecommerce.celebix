import { defaultStorefrontAssetHttpHandlers } from "../../../lib/storefront-assets-http/default.ts";

export const GET = defaultStorefrontAssetHttpHandlers.list;
export const POST = defaultStorefrontAssetHttpHandlers.upload;
export const DELETE = defaultStorefrontAssetHttpHandlers.archive;
