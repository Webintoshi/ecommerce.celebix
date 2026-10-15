import {redirectLegacySeo} from '@/lib/seo-ui/legacy-route';
export default async function LegacySeoPage(input:{params:Promise<{recordId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const{recordId}=await input.params;return redirectLegacySeo({route:'products',kind:'seo_product_entry',recordId,searchParams:await input.searchParams});}
