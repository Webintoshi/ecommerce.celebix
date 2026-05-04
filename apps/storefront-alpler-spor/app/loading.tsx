export default function Loading() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-[110] h-[3px] overflow-hidden bg-[#FF6A00]/10"
      >
        <div className="absolute inset-y-0 left-0 w-[38%] animate-[alpler-route-progress_1.05s_ease-in-out_infinite] rounded-full bg-[#FF6A00] shadow-[0_0_12px_rgba(255,106,0,0.45)]" />
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-[3px] z-[109] h-6 bg-gradient-to-b from-[#FF6A00]/8 to-transparent" />

      <div className="sr-only" aria-live="polite">
        Sayfa yükleniyor.
      </div>

      <style>{`
        @keyframes alpler-route-progress {
          0% {
            transform: translateX(-115%);
          }
          55% {
            transform: translateX(105%);
          }
          100% {
            transform: translateX(205%);
          }
        }
      `}</style>
    </>
  );
}
