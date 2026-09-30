import { CollectionEditor } from '@/components/catalog-collections/CollectionEditor';
import { PanelLayoutClient } from '@/components/panel/PanelLayoutClient';
import { MODEL } from '../../../mira-catalog/catalog-fixture';
export default function NewCollectionFixturePage(){return <PanelLayoutClient model={MODEL}><CollectionEditor canManage storefrontOrigin="https://fixture.invalid"/></PanelLayoutClient>;}
