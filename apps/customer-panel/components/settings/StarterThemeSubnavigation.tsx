"use client";

import {
  themeSubnavigationItems,
  type ThemePanelKey,
} from "./starter-theme-subnavigation-model";
import styles from "./starter-theme-composer.module.css";

export function StarterThemeSubnavigation({ activePanel, onSelect }: Readonly<{
  activePanel: ThemePanelKey;
  onSelect: (panel: ThemePanelKey) => void;
}>) {
  return <nav className={styles.themeSubnav} aria-label="Tema düzeni bölümleri">
    <div role="tablist" aria-label="Tema düzeni alt menüsü">
      {themeSubnavigationItems(activePanel).map((item) => <button
        type="button"
        role="tab"
        id={item.tabId}
        aria-controls={item.panelId}
        aria-selected={item.selected}
        className={item.selected ? styles.themeSubnavActive : undefined}
        key={item.key}
        onClick={() => onSelect(item.key)}
      >{item.label}</button>)}
    </div>
  </nav>;
}
