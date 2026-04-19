import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export default async function NotFound() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const href = user ? "/dashboard" : "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">404</p>
        <h1 className="text-3xl font-black tracking-tight">Page not found</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          This page doesn't exist or was moved.
        </p>
      </div>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_28px_rgba(249,115,22,0.45)] transition-all"
      >
        {user ? "Back to dashboard" : "Back to home"}
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </Link>
    </div>
  );
}
