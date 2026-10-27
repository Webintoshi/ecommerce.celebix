import { randomUUID } from 'node:crypto';
import { resolveDefaultServerPanelAccessRuntime } from '../../../../lib/server-panel-access/default.ts';
import { resolveServerToshiCreditsRuntime } from '../../../../lib/server-toshi-credits/runtime.ts';
import { createToshiCreditsHttpHandler } from '../../../../lib/server-toshi-credits/http.ts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const GET = createToshiCreditsHttpHandler({ resolveRuntime: async () => resolveServerToshiCreditsRuntime(await resolveDefaultServerPanelAccessRuntime()), now: () => new Date(), requestId: randomUUID });
