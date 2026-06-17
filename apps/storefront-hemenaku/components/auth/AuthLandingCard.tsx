import Link from "next/link";
import { ArrowRight, CheckCircle, Shield } from "lucide-react";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import { DEFAULT_DEMO_THEME, DEFAULT_TRUST_ITEMS } from "@/lib/default-demo-theme";
import { SITE_NAME } from "@/lib/constants";

type AuthLandingCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel: string;
  secondaryHref: string;
  onPrimaryAction?: () => void;
  primaryDisabled?: boolean;
  helperText?: string;
};

export function AuthLandingCard({
  eyebrow,
  title,
  description,
  primaryLabel,
  secondaryLabel,
  secondaryHref,
  onPrimaryAction,
  primaryDisabled = false,
  helperText,
}: AuthLandingCardProps) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#F7FAF9] px-4 py-10 text-[#111827] sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-lg border border-[#DDE7E4] bg-white shadow-sm">
            <div className="border-b border-[#DDE7E4] bg-[#F0FDFA] px-7 py-6">
              <p className="text-[11px] font-semibold uppercase text-[#0F766E]">
                {eyebrow}
              </p>
              <h1 className="mt-4 font-serif text-4xl leading-tight text-[#111827] sm:text-5xl">
                {title}
              </h1>
              <p className="mt-4 text-sm leading-7 text-[#526B66]">{description}</p>
            </div>

            <div className="space-y-5 px-7 py-7">
              <button
                type="button"
                onClick={onPrimaryAction}
                disabled={primaryDisabled}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0F766E] px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#115E59] disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                <Shield className="h-4 w-4" />
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </button>

              <Link
                href={secondaryHref}
                className="flex w-full items-center justify-center rounded-full border border-[#DDE7E4] bg-white px-6 py-4 text-sm font-semibold text-[#111827] transition hover:border-[#0F766E] hover:text-[#0F766E]"
              >
                {secondaryLabel}
              </Link>

              {helperText ? (
                <p className="rounded-lg bg-[#F7FAF9] px-4 py-3 text-center text-xs leading-6 text-[#526B66]">
                  {helperText}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {DEFAULT_TRUST_ITEMS.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg border border-[#DDE7E4] px-4 py-3 text-sm text-[#526B66]">
                    <CheckCircle className="h-4 w-4 text-[#0F766E]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm font-semibold text-[#526B66] transition hover:text-[#0F766E]">
              Ana sayfaya don
            </Link>
          </div>
        </div>

        <div className="order-1 space-y-6 lg:order-2">
          <Link href="/" className="inline-flex font-serif text-3xl font-semibold text-[#111827]">
            {SITE_NAME}
          </Link>
          <div className="relative aspect-[4/5] overflow-hidden rounded-lg shadow-[0_28px_90px_-62px_rgba(15,23,42,0.55)]">
            <DefaultDemoPlaceholder id="placeholder-02" label={DEFAULT_DEMO_THEME.heroTitle} />
          </div>
        </div>
      </div>
    </div>
  );
}
