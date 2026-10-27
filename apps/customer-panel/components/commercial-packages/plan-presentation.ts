import { Users, Tags, Mail, ReceiptText, type LucideIcon } from 'lucide-react';
import type { CommercialPackageCode } from '@celebix/saas-contracts';

export const PLAN_PRESENTATION: Readonly<Record<CommercialPackageCode, { image: string; description: string; highlight?: string; Icon: LucideIcon }>> = {
    free_starter: {
        image: '/payments/plans/celebix-free-v1.webp',
        description: 'E-ticaret yolculuğunuza başlamak için ihtiyacınız olan temel özellikler.',
        Icon: Users,
    },
    starter: {
        image: '/payments/plans/celebix-starter-v1.webp',
        description: 'Büyümeye başlayan işletmeler için satış odaklı temel araçlar.',
        highlight: 'Google Merchant Center',
        Icon: Tags,
    },
    growth: {
        image: '/payments/plans/celebix-growth-v1.webp',
        description: 'Daha fazla ürün, sipariş ve pazarlama aracıyla markanızı büyütün.',
        highlight: 'E-posta pazarlama',
        Icon: Mail,
    },
    professional: {
        image: '/payments/plans/celebix-professional-v1.webp',
        description: 'Yüksek hacimli işletmeler için kapsamlı e-ticaret yönetimi.',
        highlight: 'Manuel satış ve muhasebe',
        Icon: ReceiptText,
    },
};
