import {redirectLegacySeo} from '@/lib/seo-ui/legacy-route';
export default async function LegacySeoPage(input:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return redirectLegacySeo({route:'products',kind:'seo_product_entry',searchParams:await input.searchParams});}
