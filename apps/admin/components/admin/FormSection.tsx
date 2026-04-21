import { cn } from "@/lib/utils";

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[22px] border border-[#FE6100]/10 bg-white p-4 md:rounded-[26px] md:p-6", className)}>
      <div className="mb-4">
        <h3 className="text-base font-semibold tracking-[-0.03em] text-gray-950 md:text-lg">{title}</h3>
        {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4">{children}</div>
    </section>
  );
}
