import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

function ProductCardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="aspect-[4/5] w-full rounded-none bg-neutral-100 sm:aspect-square" />
      <div className="mx-auto flex w-[85%] flex-col items-center gap-2">
        <Skeleton className="h-4 w-full bg-neutral-100" />
        <Skeleton className="h-3.5 w-16 bg-neutral-100" />
        <div className="mt-1 flex gap-1.5">
          <Skeleton className="h-3.5 w-3.5 rounded-full bg-neutral-100" />
          <Skeleton className="h-3.5 w-3.5 rounded-full bg-neutral-100" />
          <Skeleton className="h-3.5 w-3.5 rounded-full bg-neutral-100" />
        </div>
      </div>
    </div>
  )
}

export { Skeleton, ProductCardSkeleton }
