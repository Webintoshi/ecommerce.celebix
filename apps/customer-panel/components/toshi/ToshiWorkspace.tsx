import Image from "next/image";

import { ToshiAssistant } from "./ToshiAssistant";
import styles from "./toshi.module.css";

export function ToshiWorkspace() {
  return (
    <section className={styles.workspace} aria-labelledby="toshi-workspace-title">
      <header className={styles.workspaceHeader}>
        <Image
          src="/toshi/toshi-profile.webp"
          width={72}
          height={72}
          alt="Toshi yapay zekâ mağaza asistanı"
          priority
        />
        <div>
          <h1 id="toshi-workspace-title">Toshi</h1>
          <p>Mağaza verilerinizi güvenli biçimde okuyup hızlı, doğrulanabilir yanıtlar verir.</p>
        </div>
      </header>
      <ToshiAssistant mode="page" />
    </section>
  );
}
