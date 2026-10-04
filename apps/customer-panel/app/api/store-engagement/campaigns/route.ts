import { storeEngagementHandlers } from '../../../../lib/store-engagement-http/default.ts';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=storeEngagementHandlers.list;
export const POST=storeEngagementHandlers.save;
