import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
import type {Metadata} from 'next';
import Link from 'next/link';
import {RestockManagePage} from '../../components/RestockAlerts';
export const metadata:Metadata={title:'Stok bildirimi',robots:{index:false,follow:false},referrer:'no-referrer'};
function StockAlertsPage(){return <main className="store-container" style={{paddingBlock:64,maxWidth:640}}><RestockManagePage/><p><Link href="/">Mağazaya dön</Link></p></main>;}

export default withCommercePolicyPage(StockAlertsPage);
