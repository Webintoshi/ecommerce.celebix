const STEPS = [
  ["Kimlik doğrulama", "Bekleniyor"],
  ["Mağaza kaydı", "Bekleniyor"],
  ["Yayın hazırlığı", "Bekleniyor"],
] as const;

export default function SetupPage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <h1>Kurulum durumu</h1>
        <p>Mağazanız hazır olana kadar güvenli işlem adımlarını buradan izleyebilirsiniz.</p>
      </div>
      <ol className="setup-list">
        {STEPS.map(([label, status], index) => (
          <li key={label}>
            <span className="step-index">{index + 1}</span>
            <strong>{label}</strong>
            <span>{status}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
