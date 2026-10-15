import {redirectLegacySeo} from '@/lib/seo-ui/legacy-route';
export default async function LegacySeoPage(input:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return redirectLegacySeo({route:'fast-indexing',kind:'indexing_request',searchParams:await input.searchParams});}
