import { resolveStorefrontPage } from '@/lib/page-context.ts';
import { createWhatsAppOrderPreview } from '@/lib/whatsapp-order-preview.ts';

export const dynamic = 'force-dynamic';
export const POST = createWhatsAppOrderPreview({ resolve: resolveStorefrontPage });
