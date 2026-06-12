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
    <div className="min-h-screen overflow-hidden bg-[#F6F1EB] px-4 py-10 text-[#140D08] sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(138,104,71,0.18),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(20,13,8,0.1),_transparent_34%)]" />
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="order-2 lg:order-1">
          <div className="overflow-hidden rounded-[38px] border border-black/5 bg-white shadow-[0_32px_100px_-64px_rgba(24,17,11,0.55)]">
            <div className="border-b border-black/5 bg-[#FFF9F2] px-7 py-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#8A6847]">
                {eyebrow}
              </p>
              <h1 className="mt-4 font-serif text-4xl leading-[0.98] tracking-[-0.05em] text-[#140D08] sm:text-5xl">
                {title}
              </h1>
              <p className="mt-4 text-sm leading-7 text-[#5F5147]">{description}</p>
            </div>

            <div className="space-y-5 px-7 py-7">
              <button
                type="button"
                onClick={onPrimaryAction}
                disabled={primaryDisabled}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#140D08] px-6 py-4 text-sm font-semibold text-white transition hover:bg-[#2A1B13] disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                <Shield className="h-4 w-4" />
                {primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </button>

              <Link
                href={secondaryHref}
                className="flex w-full items-center justify-center rounded-full border border-black/10 bg-white px-6 py-4 text-sm font-semibold text-[#140D08] transition hover:border-[#140D08]"
              >
                {secondaryLabel}
              </Link>

              {helperText ? (
                <p className="rounded-2xl bg-[#F6F1EB] px-4 py-3 text-center text-xs leading-6 text-[#6B5A4D]">
                  {helperText}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {DEFAULT_TRUST_ITEMS.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-2xl border border-black/5 px-4 py-3 text-sm text-[#5F5147]">
                    <CheckCircle className="h-4 w-4 text-[#8A6847]" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm font-semibold text-[#5F5147] transition hover:text-[#140D08]">
              Ana sayfaya don
            </Link>
          </div>
        </div>

        <div className="order-1 space-y-6 lg:order-2">
          <Link href="/" className="inline-flex font-serif text-3xl font-semibold tracking-[-0.04em] text-[#140D08]">
            {SITE_NAME}
          </Link>
          <div className="relative aspect-[4/5] overflow-hidden rounded-[44px] shadow-[0_36px_110px_-62px_rgba(24,17,11,0.62)]">
            <DefaultDemoPlaceholder id="placeholder-02" label={DEFAULT_DEMO_THEME.heroTitle} />
          </div>
        </div>
      </div>
    </div>
  );
}
