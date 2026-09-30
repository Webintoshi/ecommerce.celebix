import { CollectionEditor } from '@/components/catalog-collections/CollectionEditor';
import { PanelLayoutClient } from '@/components/panel/PanelLayoutClient';
import { MODEL } from '../../../../mira-catalog/catalog-fixture';
export default async function CollectionEditFixturePage({params}:{params:Promise<{resourceId:string}>}){return <PanelLayoutClient model={MODEL}><CollectionEditor resourceId={(await params).resourceId} canManage storefrontOrigin="https://fixture.invalid"/></PanelLayoutClient>;}
