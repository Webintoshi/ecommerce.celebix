"use client";

import { CampaignHeaderClient, type CampaignHeaderClientProps } from "../../components/CampaignHeaderClient";
import { GuzideMobileMenu } from "./GuzideMobileMenu";
import type { GuzideMenuImages } from "./guzide-menu.ts";
import styles from "./guzide-mobile-menu.module.css";

export function GuzideHeaderClient({ menuImages, supportEmail, ...props }: CampaignHeaderClientProps & Readonly<{ menuImages: GuzideMenuImages; supportEmail?: string }>) {
  return <CampaignHeaderClient {...props} mobileMenuClassName={styles.drawer}
    renderMobileMenu={onClose => <GuzideMobileMenu displayName={props.displayName} locale={props.locale} logo={props.logo} navigation={props.navigation} menuImages={menuImages} supportEmail={supportEmail} onClose={onClose} />} />;
}
