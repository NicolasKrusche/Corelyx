import { ForcedOrangeTheme } from "@/components/forced-orange-theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="light accent-orange min-h-screen">
      <ForcedOrangeTheme />
      {children}
    </div>
  );
}
