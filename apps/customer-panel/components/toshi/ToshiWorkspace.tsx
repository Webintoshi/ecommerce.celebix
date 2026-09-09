import { PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { ToshiAssistant } from "./ToshiAssistant";
import styles from "./toshi.module.css";

export function ToshiWorkspace() {
  return (
    <PanelPageShell>
      <PanelPageHeader
        title="Toshi"
        description="Mağaza verilerinizi güvenli biçimde okuyup hızlı, doğrulanabilir yanıtlar verir."
      />
      <section className={styles.workspace} aria-label="Toshi çalışma alanı">
        <ToshiAssistant mode="page" />
      </section>
    </PanelPageShell>
  );
}
