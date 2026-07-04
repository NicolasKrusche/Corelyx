import { CineEyebrow } from "@/components/cinematic";
import { GovernanceTabs } from "./_components/governance-tabs";

export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 text-foreground">
      <div className="space-y-3">
        <CineEyebrow>Governance &amp; Compliance</CineEyebrow>
        <GovernanceTabs />
      </div>
      {children}
    </div>
  );
}
