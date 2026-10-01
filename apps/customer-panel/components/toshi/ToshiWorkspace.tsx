import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ToshiAssistant } from "./ToshiAssistant";
import styles from "./toshi.module.css";

export function ToshiWorkspace() {
  return (
    <PanelPageShell>
      <h1 className={styles.srOnly}>Toshi</h1>
      <PanelPageHeader title="Toshi" />
      <section className={styles.workspace} aria-label="Toshi çalışma alanı">
        <ToshiAssistant mode="page" headerActions={<Link href="/" className={styles.workspaceLink} aria-label="Panele dön" title="Panele dön"><ArrowLeft aria-hidden="true" /></Link>} />
      </section>
    </PanelPageShell>
  );
}
