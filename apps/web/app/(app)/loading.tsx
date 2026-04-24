export default function AppLoading() {
  return (
    <div className="ml-16 min-h-screen px-6 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto w-full max-w-[1180px] space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
