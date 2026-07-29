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

  .resilienceAction {
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: .625rem;
    border: 1px solid var(--panel-accent, #FF6A00);
    border-radius: .875rem;
    padding: 0 1rem;
    background: var(--panel-accent, #FF6A00);
    color: var(--panel-sidebar, #2A2A2A);
    font-size: .875rem;
    font-weight: 750;
    text-decoration: none;
    transition: background-color 160ms ease, border-color 160ms ease;
  }

  .resilienceAction:hover { border-color: #E85D04; background: #E85D04; }

  @media (max-width: 640px) {
    .resilienceBoundary { padding: 1rem; }
    .resilienceBody { padding: 1.5rem; }
    .resilienceAction { width: 100%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .resilienceAction { transition: none; }
  }
`;

export default function NotFound() {
  return (
    <main className="resilienceBoundary">
      <style>{resilienceStyles}</style>
      <section className="resilienceCard" aria-labelledby="not-found-title">
        <div className="resilienceBand" aria-hidden="true" />
        <div className="resilienceBody">
          <div className="resilienceBrand">
            <span className="resilienceBrandMark" aria-hidden="true">C</span>
            Celebix
          </div>
          <span className="resilienceCode">404</span>
          <h1 id="not-found-title">Aradığınız sayfa bulunamadı</h1>
          <p className="resilienceDescription">
            Bu adres değişmiş, kaldırılmış veya panelde hiç bulunmamış olabilir.
          </p>
          <Link className="resilienceAction" href="/">Panele dön</Link>
        </div>
      </section>
    </main>
  );
}
