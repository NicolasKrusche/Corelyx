/** Instant skeleton while a governance sub-page loads its data. */
export default function GovernanceLoading() {
  return (
    <div className="space-y-6 pb-12" aria-busy="true" aria-label="Loading">
      <section className="border-b border-border pb-6">
        <div className="h-9 w-72 animate-pulse rounded-lg bg-muted/60" />
        <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-muted/40" />
        <div className="mt-2 h-4 w-3/4 max-w-xl animate-pulse rounded bg-muted/40" />
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border/50 bg-muted/30" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-border/50 bg-muted/20" />
      <div className="h-48 animate-pulse rounded-xl border border-border/50 bg-muted/20" />
    </div>
  );
}
