import type { Metadata } from "next";
import { RecoveryLinkRedeemer } from "@/components/RecoveryLinkRedeemer";

export const metadata:Metadata={title:"Sepeti geri yükle",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function RecoveryPage(){return <main className="store-section store-container"><h1>Sepet geri yükleniyor</h1><RecoveryLinkRedeemer/></main>}
