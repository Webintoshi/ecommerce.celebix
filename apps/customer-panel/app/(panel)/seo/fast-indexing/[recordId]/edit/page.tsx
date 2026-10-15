import {redirectLegacySeo} from '@/lib/seo-ui/legacy-route';
export default async function LegacySeoPage(input:{params:Promise<{recordId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){const{recordId}=await input.params;return redirectLegacySeo({route:'fast-indexing',kind:'indexing_request',recordId,searchParams:await input.searchParams});}
