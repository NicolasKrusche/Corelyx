import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Welcome | Corelyx",
};

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <div className="app-bg-gradient pointer-events-none fixed inset-0 -z-10 bg-background" />
      <div className="orb-primary" aria-hidden="true" />
      <div className="orb-blue" aria-hidden="true" />
      <div className="orb-violet" aria-hidden="true" />
      <svg
        className="pointer-events-none fixed inset-0 -z-[9] h-full w-full"
        style={{
          opacity: 0.09,
          maskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 70%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 70%)",
        }}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Different filter ID from app layout to avoid conflicts */}
        <filter id="marble-ob" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="linearRGB">
          <feTurbulence type="turbulence" baseFrequency="0.008 0.005" numOctaves="6" seed="42" stitchTiles="stitch" result="turbulence" />
          <feColorMatrix type="saturate" values="0" in="turbulence" result="grey" />
          <feComponentTransfer in="grey">
            <feFuncR type="linear" slope="5" intercept="-2" />
            <feFuncG type="linear" slope="5" intercept="-2" />
            <feFuncB type="linear" slope="5" intercept="-2" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#marble-ob)" />
      </svg>
      {children}
    </div>
  );
}
