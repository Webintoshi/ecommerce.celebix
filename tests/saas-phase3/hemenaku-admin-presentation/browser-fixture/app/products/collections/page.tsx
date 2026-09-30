import { CollectionConsole } from '@/components/catalog-collections/CollectionConsole';
import { PanelLayoutClient } from '@/components/panel/PanelLayoutClient';
import { MODEL } from '../../mira-catalog/catalog-fixture';
export default function CollectionsFixturePage(){return <PanelLayoutClient model={MODEL}><CollectionConsole canManage storefrontOrigin="https://fixture.invalid"/></PanelLayoutClient>;}
