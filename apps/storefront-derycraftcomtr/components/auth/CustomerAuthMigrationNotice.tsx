import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";

type CustomerAuthMigrationNoticeProps = {
  title: string;
  description: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export function CustomerAuthMigrationNotice({
  title,
  description,
  primaryHref = "/odeme",
  primaryLabel = "Misafir odemeye gec",
  secondaryHref = "/",
  secondaryLabel = "Ana sayfaya don",
}: CustomerAuthMigrationNoticeProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFF5F5] to-[#FFE5E5] flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Bu prova sirasinda musteri auth yuzeyleri sessiz Supabase fallback yerine acik
                  <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-[12px]">
                    requires_auth_migration
                  </code>
                  durumuna alinir.
                </span>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href={primaryHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-[#7B1113]"
              >
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={secondaryHref}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-gray-200 px-6 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                {secondaryLabel}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
