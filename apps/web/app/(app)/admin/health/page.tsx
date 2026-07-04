import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { getHealthStatus } from "@/lib/health-check";
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Activity,
  Database,
  Server,
  Cpu
} from "lucide-react";

export default async function HealthPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasTechnicalAccess(user.id, user.email))) redirect("/admin");

  const health = await getHealthStatus();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">System Health</h1>
        <p className="text-muted-foreground">Detailed health check results</p>
      </div>
      
      {/* Overall Status */}
      <div className={`p-6 rounded-lg border ${
        health.status === "healthy"
          ? "bg-green-500/10 border-green-500/30"
          : health.status === "degraded"
          ? "bg-yellow-500/10 border-yellow-500/30"
          : "bg-red-500/10 border-red-500/30"
      }`}>
        <div className="flex items-center gap-4">
          {health.status === "healthy" ? (
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
          ) : health.status === "degraded" ? (
            <AlertTriangle className="w-12 h-12 text-yellow-600 dark:text-yellow-400" />
          ) : (
            <XCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
          )}
          <div>
            <h2 className={`text-2xl font-bold ${
              health.status === "healthy"
                ? "text-green-700 dark:text-green-300"
                : health.status === "degraded"
                ? "text-yellow-700 dark:text-yellow-300"
                : "text-red-700 dark:text-red-300"
            }`}>
              {health.status === "healthy" ? "All Systems Operational" : 
               health.status === "degraded" ? "Systems Degraded" : 
               "Systems Unhealthy"}
            </h2>
            <p className="text-muted-foreground">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground">
              Version: {health.version}
            </p>
          </div>
        </div>
      </div>
      
      {/* Health Check Details */}
      <div className="grid gap-4">
        {Object.entries(health.checks).map(([name, check]) => {
          if (!check) return null;
          
          const icons = {
            database: Database,
            runtime: Server,
            litellm_proxy: Cpu,
          };
          
          const Icon = icons[name as keyof typeof icons] || Activity;
          
          return (
            <div 
              key={name}
              className={`bg-card rounded-lg shadow-sm border overflow-hidden ${
                check.status === "pass"
                  ? "border-green-500/30"
                  : check.status === "warn"
                  ? "border-yellow-500/30"
                  : "border-red-500/30"
              }`}
            >
              <div className={`px-6 py-4 border-b ${
                check.status === "pass"
                  ? "bg-green-500/10 border-green-500/30"
                  : check.status === "warn"
                  ? "bg-yellow-500/10 border-yellow-500/30"
                  : "bg-red-500/10 border-red-500/30"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${
                      check.status === "pass"
                        ? "text-green-600 dark:text-green-400"
                        : check.status === "warn"
                        ? "text-yellow-600 dark:text-yellow-400"
                        : "text-red-600 dark:text-red-400"
                    }`} />
                    <h3 className="font-semibold capitalize">
                      {name.replace(/_/g, " ")}
                    </h3>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    check.status === "pass"
                      ? "bg-green-500/15 text-green-700 dark:text-green-300"
                      : check.status === "warn"
                      ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"
                      : "bg-red-500/15 text-red-700 dark:text-red-300"
                  }`}>
                    {check.status === "pass" ? "Healthy" : 
                     check.status === "warn" ? "Warning" : "Failed"}
                  </span>
                </div>
              </div>
              
              <div className="px-6 py-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Response Time</p>
                    <p className="font-medium text-foreground">
                      {check.responseTimeMs}ms
                    </p>
                  </div>
                  {check.message && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Message</p>
                      <p className={`font-medium ${
                        check.status === "fail" ? "text-red-600 dark:text-red-400" : "text-foreground"
                      }`}>
                        {check.message}
                      </p>
                    </div>
                  )}
                  {check.lastError && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Last Error</p>
                      <p className="text-red-600 dark:text-red-400 font-mono text-xs">
                        {check.lastError}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Refresh Info */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Health checks are performed in real-time on each page load.</p>
        <p>For continuous monitoring, check the status page or set up alerts.</p>
      </div>
    </div>
  );
}
