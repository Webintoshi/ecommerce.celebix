const STEPS = [
  ["Kimlik doğrulama", "Tamamlandı"],
  ["Mağaza yetkisi", "Doğrulandı"],
  ["Ürün kataloğu", "Kullanılabilir"],
] as const;

export default function SetupPage() {
  return (
    <section className="page-stack">
      <div className="page-heading">
        <h1>Kurulum durumu</h1>
        <p>Aktif oturumunuzun kullanabildiği panel özelliklerini buradan izleyebilirsiniz.</p>
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
