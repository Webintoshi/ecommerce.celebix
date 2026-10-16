import {accountingMoney as money} from "@/lib/accounting-ui/model";
import workspace from "./ReceivablesWorkspace.module.css";

export function CollectionCustomerSummary({name,phone,dueCents,currency,archived=false}:{name:string;phone?:string|null;dueCents:number;currency:string;archived?:boolean}) {
  return <div className={workspace.customer}>
    <div className={workspace.customerIdentity}><strong>{name}</strong>{phone?<span>{phone}</span>:null}{archived?<small>Arşivlenmiş müşteri · borç görünür</small>:null}</div>
    <dl className={workspace.customerDebt}><dt>Açık borç</dt><dd>{money(dueCents,currency)}</dd></dl>
  </div>;
}
