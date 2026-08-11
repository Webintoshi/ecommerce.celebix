import {
  FIXED_STOREFRONT_POLICIES,
  type PublicPolicyPage,
  type PublicStarterThemePresentationV3,
} from "@celebix/saas-contracts";

type FooterGroups = PublicStarterThemePresentationV3["footer"]["groups"];
type FooterLink = FooterGroups[number]["links"][number];

function immutableGroup(group: FooterGroups[number], links: readonly FooterLink[]) {
  return Object.freeze({
    heading: group.heading,
    links: Object.freeze(links.map((link) => Object.freeze({ ...link }))),
  });
}

export function mergePublishedPolicyFooterGroups(
  groups: FooterGroups,
  policies: readonly PublicPolicyPage[],
): FooterGroups {
  const fixedRoutes = new Set<string>(FIXED_STOREFRONT_POLICIES.map(({ route }) => route));
  const publishedLinks = FIXED_STOREFRONT_POLICIES.flatMap((definition) =>
    policies.some((page) => page.key === definition.key && page.published)
      ? [Object.freeze({ label: definition.label, destination: definition.route })]
      : [],
  );
  const output: Array<FooterGroups[number]> = [];
  const policyExtras: FooterLink[] = [];
  let policyPosition: number | null = null;

  for (const group of groups) {
    const nonPolicyLinks = group.links.filter(({ destination }) => !fixedRoutes.has(destination));
    if (group.heading === "Politikalar") {
      if (policyPosition === null) policyPosition = output.length;
      policyExtras.push(...nonPolicyLinks);
      continue;
    }
    output.push(immutableGroup(group, nonPolicyLinks));
  }

  const policyLinks = Object.freeze([
    ...policyExtras.map((link) => Object.freeze({ ...link })),
    ...publishedLinks,
  ]);
  if (policyLinks.length > 0) {
    output.splice(
      policyPosition ?? output.length,
      0,
      Object.freeze({ heading: "Politikalar", links: policyLinks }),
    );
  }
  return Object.freeze(output);
}
