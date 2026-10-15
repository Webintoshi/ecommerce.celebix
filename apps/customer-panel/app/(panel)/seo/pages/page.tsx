import {redirectLegacySeo} from '@/lib/seo-ui/legacy-route';
export default async function LegacySeoPage(input:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return redirectLegacySeo({route:'pages',kind:'seo_page_entry',searchParams:await input.searchParams});}
