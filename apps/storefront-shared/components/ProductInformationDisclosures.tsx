import Link from "next/link";
import type { ReactNode } from "react";
import type {
  PublicPolicyPage,
  PublicProductMerchandising,
  StarterProductInformationSection,
} from "@celebix/saas-contracts";

import { renderStarterProductDescription } from "@/lib/product-description.ts";
import styles from "./product-detail-experience.module.css";

type Props = Readonly<{
  informationSections: readonly StarterProductInformationSection[];
  merchandising?: PublicProductMerchandising;
  description?: string;
  publishedPolicies: readonly PublicPolicyPage[];
}>;

type Disclosure = Readonly<{ key: string; label: string; content: ReactNode }>;

export function ProductSizeGuide({ heading, body }: Readonly<{ heading: string; body: string }>) {
  const html = renderStarterProductDescription(body, heading);
  if (!html) return null;
  return <details className={styles.sizeGuide}>
    <summary>{heading}<span aria-hidden="true">↗</span></summary>
    <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: html }} />
  </details>;
}

export function ProductInformationDisclosures({ informationSections, merchandising, description, publishedPolicies }: Props) {
  const disclosures = informationSections.flatMap<Disclosure>((section) => {
    if (section === "description") {
      const html = renderStarterProductDescription(description, "Ürün açıklaması");
      return html ? [Object.freeze({ key: section, label: "Açıklama", content: <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: html }} /> })] : [];
    }
    if (section === "materials_and_care") {
      const html = renderStarterProductDescription(merchandising?.materialsAndCare, "Malzeme ve bakım");
      return html ? [Object.freeze({ key: section, label: "Malzeme ve bakım", content: <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: html }} /> })] : [];
    }
    if (section === "certifications") {
      return merchandising?.certifications.length ? [Object.freeze({ key: section, label: "Sertifikalar", content: <ul>{merchandising.certifications.map((certification) => <li key={certification}>{certification}</li>)}</ul> })] : [];
    }
    return publishedPolicies.length ? [Object.freeze({
      key: section,
      label: "Kargo ve iadeler",
      content: <div className={styles.policyList}>{publishedPolicies.map((policy) => <article key={policy.key}><h3>{policy.label}</h3>{policy.html ? <div className="product-description-rich-text" dangerouslySetInnerHTML={{ __html: policy.html }} /> : null}<Link href={policy.route}>Politikanın tamamını görüntüle</Link></article>)}</div>,
    })] : [];
  });
  if (disclosures.length === 0) return null;
  return <section className={`${styles.disclosures} store-container`} aria-labelledby="product-information-title">
    <header><p className={styles.eyebrow}>ÜRÜN BİLGİLERİ</p><h2 id="product-information-title">Ayrıntılar</h2></header>
    <div>{disclosures.map((disclosure, index) => <details key={disclosure.key} open={index === 0}><summary>{disclosure.label}<span aria-hidden="true">⌄</span></summary><div className={styles.disclosureBody}>{disclosure.content}</div></details>)}</div>
  </section>;
}
