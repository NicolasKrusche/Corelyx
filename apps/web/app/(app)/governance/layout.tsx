import { GovernanceTabs } from "./_components/governance-tabs";

export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 text-foreground">
      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          Governance &amp; Compliance
        </p>
        <GovernanceTabs />
      </div>
      {children}
    </div>
  );
}
