import { GuzideLoadingBoundary } from "../themes/guzide/GuzideMobileExperience";
export default function Loading() { return <GuzideLoadingBoundary fallback={<main className="loading-page" role="status"><span className="loading-mark" /> Mağaza yükleniyor…</main>} />; }
