import {redirectLegacySeo} from '@/lib/seo-ui/legacy-route';
export default async function LegacySeoPage(input:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return redirectLegacySeo({route:'settings',kind:'seo_control',searchParams:await input.searchParams});}
