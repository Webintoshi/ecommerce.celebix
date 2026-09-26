import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { ArtificialIntelligenceSettings } from "@/components/toshi-settings/ArtificialIntelligenceSettings";

import { MODEL } from "../mira-catalog/catalog-fixture";

export default function DeepSeekSettingsFixturePage() {
  return (
    <PanelLayoutClient model={MODEL}>
      <ArtificialIntelligenceSettings canManage />
    </PanelLayoutClient>
  );
}
