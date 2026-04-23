import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[#EEF2F7]", className)}
      {...props}
    />
  )
}

function ProductCardSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-3">
      <Skeleton className="aspect-[4/5] h-auto w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  )
}

export { Skeleton, ProductCardSkeleton }
