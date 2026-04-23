import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

async function getReturnTarget() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !supabaseUrl ||
    supabaseUrl.includes("placeholder") ||
    !supabaseAnonKey ||
    supabaseAnonKey.includes("placeholder")
  ) {
    return { href: "/", label: "Back to homepage" };
  }

  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      return { href: "/dashboard", label: "Back to dashboard" };
    }
  } catch {
    // Fall back to the public landing page if auth lookup is unavailable.
  }

  return { href: "/", label: "Back to homepage" };
}

type LegalPageHeaderProps = {
  maxWidthClass: string;
};

export async function LegalPageHeader({
  maxWidthClass,
}: LegalPageHeaderProps) {
  const { href, label } = await getReturnTarget();

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/85 backdrop-blur-xl">
      <div
        className={`mx-auto flex h-14 items-center justify-between px-6 ${maxWidthClass}`}
      >
        <Link href={href} className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pictures/logo-no-bg.png"
            alt="Nexflow"
            className="h-6 w-6 object-contain"
          />
          <span className="text-sm font-bold tracking-tight">Nexflow</span>
        </Link>
        <Link
          href={href}
          className="text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          {label}
        </Link>
      </div>
    </header>
  );
}
