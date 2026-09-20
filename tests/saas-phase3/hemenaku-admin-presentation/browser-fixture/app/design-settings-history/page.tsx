import Link from "next/link";

export default function DesignHistoryFixture() {
  return <main style={{ padding: 32 }}>
    <h1>İzole geçmiş kabulü</h1>
    <p>Yalnız yerel tarayıcı geçmişi testi; canlı bağlantı yok.</p>
    <Link href="/design-settings-fix">İzole tasarım ayarlarına dön</Link>
  </main>;
}
