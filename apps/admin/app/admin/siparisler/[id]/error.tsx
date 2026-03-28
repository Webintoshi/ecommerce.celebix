"use client";

export default function Error({ error }: { error: Error & { digest?: string } }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen py-20 bg-gray-50">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Bir Hata Oluştu</h1>
            <p className="text-gray-500 mb-6">{error.message}</p>
            <a
                href="/admin/siparisler"
                className="inline-flex items-center gap-2 px-6 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
                Sipariş Listesine Dön
            </a>
        </div>
    );
}
