import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import {
  Activity,
  AlertTriangle,
  MessageCircle,
  Shield,
  ShieldAlert,
  Zap,
  Settings,
  DollarSign,
  PlayCircle,
  Lock,
  ArrowLeft,
  FileText,
  Users,
  Newspaper,
  Ticket,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Admin Dashboard",
};

async function getUser() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

type AdminProfileRow = {
  is_admin: boolean | null;
  team_role: string | null;
};

type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const supabase = await createServerClient();
  const service = createServiceClient();

  const [profileRes, openTicketsRes] = await Promise.all([
    supabase.from("profiles").select("is_admin, team_role").eq("id", user.id).single(),
    service.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  const adminProfile = profileRes.data as unknown as AdminProfileRow | null;
  const isAdmin = isAdminEmail(user.email ?? undefined) || adminProfile?.is_admin === true;

  if (!isAdmin) {
    redirect("/dashboard?error=admin_required");
  }

  const teamRole = adminProfile?.team_role ?? null;
  const isFounder = isAdminEmail(user.email ?? undefined) || teamRole === "founder";
  const canAccessTechnical = isFounder || teamRole === "dev";
  const canAccessCosts = canAccessTechnical || teamRole === "marketing";
  const openTicketCount = openTicketsRes.count ?? 0;

  const navItems: AdminNavItem[] = [
    { href: "/admin", label: "Overview", icon: Activity },
    ...(canAccessTechnical ? [
      { href: "/admin/health", label: "System Health", icon: Shield },
      { href: "/admin/circuits", label: "Circuit Breakers", icon: Zap },
      { href: "/admin/runs", label: "Active Runs", icon: PlayCircle },
      { href: "/admin/test-firms", label: "Test Firms", icon: Building2 },
      { href: "/admin/emergency", label: "Emergency", icon: AlertTriangle },
      { href: "/admin/security", label: "Security Sentinel", icon: ShieldAlert },
      { href: "/admin/locks", label: "Credential Locks", icon: Lock },
      { href: "/admin/flags", label: "Feature Flags", icon: Settings },
    ] as AdminNavItem[] : []),
    ...(canAccessCosts ? [
      { href: "/admin/costs", label: "Costs & Billing", icon: DollarSign },
    ] as AdminNavItem[] : []),
    { href: "/admin/support", label: "Support Tickets", icon: MessageCircle, badge: openTicketCount },
    { href: "/admin/codes", label: "Code Manager", icon: Ticket },
    { href: "/admin/posts", label: "Posts", icon: Newspaper },
    ...(isFounder ? [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/dsr", label: "DSR Queue", icon: FileText },
      { href: "/admin/team", label: "Team", icon: Users },
    ] as AdminNavItem[] : []),
  ];

  return (
    <div className="min-h-screen">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Admin Dashboard</h1>
          <p className="text-muted-foreground">System monitoring and controls</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>

      <div className="flex gap-6">
        <nav className="w-56 shrink-0">
          <div className="sticky top-6 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    "hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            {canAccessTechnical && (
              <div className="mt-6 pt-6 border-t">
                <p className="mb-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Quick Actions
                </p>
                <Link
                  href="/admin/emergency"
                  className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Emergency Stop
                </Link>
                <Link
                  href="/admin/security"
                  className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <Shield className="h-4 w-4" />
                  Security Sentinel
                </Link>
              </div>
            )}
          </div>
        </nav>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
