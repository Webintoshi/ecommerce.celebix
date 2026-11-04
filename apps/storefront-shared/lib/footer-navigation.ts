import type { PublicStarterThemePresentationV3 } from "@celebix/saas-contracts";

type FooterGroups = PublicStarterThemePresentationV3["footer"]["groups"];
const ACCOUNT_HEADINGS = new Set(["hesap", "hesabım", "hesabim", "account", "my account"]);
const headingKey = (heading: string) => heading.trim().toLocaleLowerCase("tr-TR");

export function visibleFooterGroups(groups: FooterGroups): FooterGroups {
  const visible = groups.filter(group => group.links.length > 0 && !ACCOUNT_HEADINGS.has(headingKey(group.heading)));
  const policyPosition = visible.findIndex(group => headingKey(group.heading) === "politikalar");
  if (policyPosition > 1) {
    const [policies] = visible.splice(policyPosition, 1);
    visible.splice(1, 0, policies!);
  }
  return Object.freeze(visible);
}
