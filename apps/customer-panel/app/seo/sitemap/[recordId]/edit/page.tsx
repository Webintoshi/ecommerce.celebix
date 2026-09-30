import {redirectLegacySeo} from '@/lib/seo-ui/legacy-route';
export default async function LegacySeoPage(input:{params:Promise<{recordId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const{recordId}=await input.params;return redirectLegacySeo({route:'sitemap',kind:'sitemap',recordId,searchParams:await input.searchParams});}
