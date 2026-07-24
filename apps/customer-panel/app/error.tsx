"use client";

import Link from "next/link";

const resilienceStyles = `
  .resilienceBoundary {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
    background:
      radial-gradient(circle at top right, rgb(255 106 0 / 12%), transparent 30rem),
      var(--panel-bg, #F9F9F9);
    color: #1F2937;
  }

  .resilienceCard {
    width: min(100%, 36rem);
    overflow: hidden;
    border: 1px solid #E3E7EE;
    border-radius: 1rem;
    background: #FFFFFF;
    box-shadow: 0 24px 64px rgb(17 24 39 / 10%);
  }

  .resilienceBand {
    height: .375rem;
    background: var(--panel-accent, #FF6A00);
  }

  .resilienceBody {
    display: grid;
    justify-items: start;
    gap: .875rem;
    padding: clamp(1.5rem, 5vw, 2.5rem);
  }

  .resilienceBrand {
    display: flex;
    align-items: center;
    gap: .625rem;
    color: var(--panel-sidebar, #2A2A2A);
    font-size: .75rem;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .resilienceBrandMark {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    border-radius: .625rem;
    background: var(--panel-sidebar, #2A2A2A);
    color: #FFFFFF;
    font-size: .875rem;
    letter-spacing: 0;
  }

  .resilienceCode {
    margin: .625rem 0 0;
    color: #A94300;
    font-size: .75rem;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  .resilienceCard h1 {
    margin: 0;
    color: var(--panel-sidebar, #2A2A2A);
    font-size: clamp(1.75rem, 6vw, 2.5rem);
    letter-spacing: -.04em;
    line-height: 1.1;
  }

  .resilienceDescription {
    max-width: 30rem;
    margin: 0;
    color: #667085;
    font-size: .9375rem;
    line-height: 1.65;
  }

  .resilienceActions {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    margin-top: .625rem;
  }

  .resilienceAction {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #D0D5DD;
    border-radius: .875rem;
    padding: 0 1rem;
    background: #FFFFFF;
    color: var(--panel-sidebar, #2A2A2A);
    cursor: pointer;
    font: inherit;
    font-size: .875rem;
    font-weight: 750;
    text-decoration: none;
    transition: background-color 160ms ease, border-color 160ms ease;
  }

  .resilienceActionPrimary {
    border-color: var(--panel-accent, #FF6A00);
    background: var(--panel-accent, #FF6A00);
  }

  .resilienceAction:hover { border-color: #98A2B3; }
  .resilienceActionPrimary:hover { border-color: #E85D04; background: #E85D04; }

  @media (max-width: 640px) {
    .resilienceBoundary { padding: 1rem; }
    .resilienceBody { padding: 1.5rem; }
    .resilienceActions,
    .resilienceAction { width: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .resilienceAction { transition: none; }
  }
`;

export default function ErrorBoundary({ reset }: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="resilienceBoundary">
      <style>{resilienceStyles}</style>
      <section className="resilienceCard" role="alert" aria-labelledby="panel-error-title">
        <div className="resilienceBand" aria-hidden="true" />
        <div className="resilienceBody">
          <div className="resilienceBrand">
            <span className="resilienceBrandMark" aria-hidden="true">C</span>
            Celebix
          </div>
          <p className="resilienceCode">Geçici bağlantı sorunu</p>
          <h1 id="panel-error-title">Panel geçici olarak açılamadı</h1>
          <p className="resilienceDescription">
            İşlem tamamlanamadı. Yeniden deneyebilir veya panel özetine güvenli biçimde dönebilirsiniz.
          </p>
          <div className="resilienceActions">
            <button className="resilienceAction resilienceActionPrimary" type="button" onClick={reset}>
              Tekrar dene
            </button>
            <Link className="resilienceAction" href="/">Panele dön</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
