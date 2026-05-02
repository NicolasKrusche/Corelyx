import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isAdminEmail } from "@/lib/admin";
import { 
  Activity, 
  AlertTriangle, 
  Shield, 
  Zap, 
  Settings, 
  DollarSign,
  PlayCircle,
  Lock,
  ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Admin Dashboard - Corelyx",
};

async function getUser() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

const navItems = [
  { href: "/admin", label: "Overview", icon: Activity },
  { href: "/admin/health", label: "System Health", icon: Shield },
  { href: "/admin/circuits", label: "Circuit Breakers", icon: Zap },
  { href: "/admin/runs", label: "Active Runs", icon: PlayCircle },
  { href: "/admin/costs", label: "Costs & Billing", icon: DollarSign },
  { href: "/admin/emergency", label: "Emergency", icon: AlertTriangle },
  { href: "/admin/locks", label: "Credential Locks", icon: Lock },
  { href: "/admin/flags", label: "Feature Flags", icon: Settings },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  
  if (!user) {
    redirect("/login?redirect=/admin");
  }
  
  // Check admin status via env var or database
  const { data: profile } = await createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies().getAll();
        },
      },
    }
  )
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  
  const isAdmin = isAdminEmail(user.email ?? undefined) || profile?.is_admin === true;
  
  if (!isAdmin) {
    redirect("/dashboard?error=admin_required");
  }
  
  return (
    <div className="min-h-screen">
      {/* Simple admin header - matches app theme */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
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
      
      {/* Two column layout */}
      <div className="flex gap-6">
        {/* Left sidebar navigation */}
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
                  <span>{item.label}</span>
                </Link>
              );
            })}
            
            {/* Quick Actions */}
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
                href="/docs/incident-response"
                target="_blank"
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Shield className="h-4 w-4" />
                View Runbook
              </Link>
            </div>
          </div>
        </nav>
        
        {/* Main content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
