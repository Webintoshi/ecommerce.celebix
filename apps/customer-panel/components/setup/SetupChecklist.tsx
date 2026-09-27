import { setupPresentation } from "@/lib/setup-ui/presentation";
import type { SetupStatus } from "@/lib/server-setup/types";
import styles from "./setup-checklist.module.css";
export function SetupChecklist({status}:Readonly<{status:SetupStatus}>) {
 return <div className={styles.groups}>{setupPresentation(status).map(group=><section key={group.id} aria-labelledby={`setup-${group.id}`} className={styles.group}>
  <h2 id={`setup-${group.id}`}>{group.label}</h2>
  <ul className={styles.list}>{group.items.map(row=><li key={row.id} className={styles.row}>
   <div className={styles.content}><h3>{row.label}</h3><p>{row.detail}</p>{row.recommendation?<p className={styles.recommendation}>{row.recommendation}</p>:null}</div>
   <span className={styles.status} data-state={row.state}>{row.status}</span>
   {row.href?<a href={row.href} className={styles.action}>{row.action}<span className="sr-only"> · {row.label}</span></a>:<span className={styles.noAction} aria-hidden="true">—</span>}
  </li>)}</ul>
 </section>)}</div>;
}
