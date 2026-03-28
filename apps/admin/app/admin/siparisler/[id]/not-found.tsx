import { ArrowLeft, FileX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                <FileX className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Sipariş Bulunamadı</h1>
            <p className="text-gray-500 mb-6">Aradığınız sipariş mevcut değil veya silinmiş.</p>
            <Link
                href="/admin/siparisler"
                className="inline-flex items-center gap-2 px-6 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Sipariş Listesine Dön
            </Link>
        </div>
    );
}
