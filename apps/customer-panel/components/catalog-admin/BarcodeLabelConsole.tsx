"use client";

import { useMemo, useState } from "react";
import {
  parseBarcodeLabelRows,
  type BarcodeLabelRow,
} from "@celebix/saas-contracts";

export function BarcodeLabelConsole({
  products,
}: {
  products: readonly BarcodeLabelRow[];
}) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => parseBarcodeLabelRows(products), [products]);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (needle === "") return rows;
    return rows.filter((row) =>
      [row.productTitle, row.variantTitle, row.sku, row.barcode]
        .filter((value): value is string => value !== undefined)
        .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle)),
    );
  }, [query, rows]);

  return (
    <section className="catalog-page" aria-labelledby="barcode-label-title">
      <div className="catalog-heading-row barcode-screen-controls">
        <div className="catalog-heading">
          <span className="eyebrow">KATALOG</span>
          <h1 id="barcode-label-title">Barkod etiketleri</h1>
          <p>Yalnızca ürün varyantlarında kayıtlı barkodları arayın ve yazdırın.</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => window.print()}
          disabled={visible.length === 0}
        >
          Etiketleri yazdır
        </button>
      </div>

      <div className="catalog-toolbar barcode-screen-controls">
        <label>
          <span className="sr-only">Barkod etiketlerinde ara</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Ürün, varyant, SKU veya barkod ara"
            aria-label="Barkod etiketlerinde ara"
          />
        </label>
        <span role="status" aria-live="polite">{visible.length} etiket</span>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state barcode-screen-controls">
          <h2>Yazdırılabilir barkod bulunamadı</h2>
          <p>Barkod üretilmez; yalnızca ürün varyantında kayıtlı değerler gösterilir.</p>
        </div>
      ) : (
        <div className="barcode-print-sheet" aria-label="Yazdırılabilir barkod etiketleri">
          {visible.map((row) => (
            <article className="barcode-label" key={row.variantId}>
              <strong>{row.productTitle}</strong>
              <span>{row.variantTitle}</span>
              {row.sku ? <small>SKU {row.sku}</small> : null}
              <code>{row.barcode}</code>
            </article>
          ))}
        </div>
      )}

      <style jsx global>{`
        .barcode-print-sheet {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
          gap: 1rem;
        }
        .barcode-label {
          display: grid;
          gap: 0.35rem;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          padding: 1rem;
          break-inside: avoid;
          text-align: center;
        }
        .barcode-label code {
          font-size: 1rem;
          letter-spacing: 0.12em;
          overflow-wrap: anywhere;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .barcode-print-sheet,
          .barcode-print-sheet * {
            visibility: visible;
          }
          .barcode-screen-controls {
            display: none !important;
          }
          .barcode-print-sheet {
            position: absolute;
            inset: 0;
            grid-template-columns: repeat(3, 1fr);
            print-color-adjust: exact;
          }
        }
      `}</style>
    </section>
  );
}
