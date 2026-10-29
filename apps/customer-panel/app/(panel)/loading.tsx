import { PanelRouteLoading } from "@/components/panel/PanelRouteLoading";
import { PanelInitialDataGate } from "@/components/panel/PanelInitialDataGate";

export default function Loading() {
  return <PanelInitialDataGate pending><PanelRouteLoading /></PanelInitialDataGate>;
}
