import { orderBumpHandlers } from '../../../lib/order-bumps-http/default.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = orderBumpHandlers.get;
export const POST = orderBumpHandlers.save;
