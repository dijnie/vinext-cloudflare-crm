export function NavigationSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6" data-navigation-pending role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="space-y-3">
          <div className="h-8 w-48 rounded-md bg-muted" />
          <div className="h-4 w-72 max-w-full rounded bg-muted" />
        </div>
        <div className="flex justify-between gap-4">
          <div className="h-10 w-72 max-w-[65%] rounded-md bg-muted" />
          <div className="h-10 w-24 rounded-md bg-muted" />
        </div>
        <div className="divide-y overflow-hidden rounded-lg border bg-background">
          <div className="h-11 bg-muted/60" />
          {Array.from({ length: 6 }, (_, row) => (
            <div className="flex h-16 items-center gap-6 px-4" key={row}>
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="h-4 w-1/4 rounded bg-muted" />
              <div className="ml-auto h-4 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
