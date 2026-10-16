import type { CommercialPackage } from '@celebix/saas-contracts';
export const packageMoney = (cents: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(cents / 100);
export const packageCount = (count: number) => new Intl.NumberFormat('tr-TR').format(count);
export const packageStorage = (bytes: number) => { const unit = bytes >= 1000000000 ? ['GB', 1000000000] as const : bytes >= 1000000 ? ['MB', 1000000] as const : bytes >= 1000 ? ['KB', 1000] as const : ['B', 1] as const; return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(bytes / unit[1])} ${unit[0]}`; };
export const hasAnnualDiscount = (plan: CommercialPackage) => plan.monthlyPriceCents > 0 && plan.annualPriceCents < 12 * plan.monthlyPriceCents;
