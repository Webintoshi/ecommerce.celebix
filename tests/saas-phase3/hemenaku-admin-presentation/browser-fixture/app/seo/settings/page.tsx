import { SeoFixtureScreen } from '../SeoFixtureScreen';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const q=await searchParams;return <SeoFixtureScreen view="settings" scenario={typeof q.scenario==='string'?q.scenario:'normal'}/>;}
