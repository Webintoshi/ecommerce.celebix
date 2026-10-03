import type { PublicCart, PublicStarterThemePresentationV2 } from "@celebix/saas-contracts";
import { formatTry } from "../lib/format.ts";
import { freeShippingProgress } from "./campaign-ui-model.ts";
import styles from "./free-shipping-progress.module.css";

export function FreeShippingProgress({cart,presentation}:Readonly<{cart:PublicCart|null;presentation?:PublicStarterThemePresentationV2["cart"]}>){
 const progress=freeShippingProgress(presentation,cart);
 if(!progress)return null;
 return <section className={styles.progress} aria-label="Ücretsiz kargo" aria-live="polite" data-free-shipping-progress="true"><p>{progress.achieved?"Ücretsiz kargo kazandınız.":<>Ücretsiz kargoya <strong>{formatTry(progress.remainingCents)}</strong> kaldı.</>}</p><div className={styles.track} role="progressbar" aria-label="Ücretsiz kargo ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{width:`${progress.percent}%`}}/></div></section>;
}
