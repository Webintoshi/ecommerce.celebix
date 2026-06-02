import Link from "next/link";
import { QuickOrderCheckoutPage } from "@/components/checkout/QuickOrderCheckoutPage";
import { isDerycraftLightPostgresRuntime } from "@/lib/derycraft-light-postgres";

export default async function QuickOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (isDerycraftLightPostgresRuntime()) {
    return (
      <div className="min-h-[60vh] bg-gradient-to-br from-[#FFF5F5] to-[#FFE5E5] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            Quick Payment Link Temporarily Disabled
          </h1>
          <p className="mt-4 text-base leading-7 text-neutral-600">
            Quick payment links are temporarily disabled during the light Postgres rehearsal preparation for DeryCraft.
            You can complete your order as a guest from the standard checkout step.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/odeme"
              className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Go to Checkout
            </Link>
            <Link
              href="/urunler"
              className="inline-flex items-center justify-center rounded-xl border border-neutral-200 px-5 py-3 text-sm font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50"
            >
              Browse Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { token } = await params;
  return <QuickOrderCheckoutPage token={token} />;
}
