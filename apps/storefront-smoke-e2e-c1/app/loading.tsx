export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5">
      <div className="text-center">
        {/* Animated Logo/Icon */}
        <div className="mb-8 animate-bounce">
          <div className="text-8xl">🥜</div>
        </div>

        {/* Loading Text */}
        <h2 className="text-2xl font-bold text-primary mb-4">Yükleniyor...</h2>
        <p className="text-gray-600">Lütfen bekleyin</p>

        {/* Loading Spinner */}
        <div className="mt-8 flex justify-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    </div>
  );
}
