import type { Metadata } from "next";
import { ForcedOrangeTheme } from "@/components/forced-orange-theme";

// Auth pages are thin functional screens — exclude from index entirely.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="light accent-orange min-h-screen">
      <ForcedOrangeTheme />
      {children}
    </div>
  );
}
