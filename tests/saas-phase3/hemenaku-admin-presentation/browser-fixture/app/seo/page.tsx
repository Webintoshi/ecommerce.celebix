import { SeoFixtureScreen } from './SeoFixtureScreen';
import type { SeoTab } from '@/components/seo/SeoOverview';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const q=await searchParams;const tab=(['sitemap','links','notifications'].includes(String(q.tab))?q.tab:'checks')as SeoTab;return <SeoFixtureScreen view="overview" tab={tab} scenario={typeof q.scenario==='string'?q.scenario:'normal'}/>;}
